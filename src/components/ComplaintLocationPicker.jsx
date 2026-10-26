import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import { useProfile } from "../hooks/useProfile";
import { cityCenter, cityPresets } from "../services/profileService";
import IndiaLocationPicker from "./IndiaLocationPicker";
import GpsConsentNotice, { GpsAlert } from "./GpsConsentNotice";
import { useGpsConsent } from "../hooks/useGpsConsent";
import { gpsBlocker, gpsErrorMessage, lowAccuracyMessage } from "../utils/gps";

// "Where is the problem?" for complaints. The preferred location is the
// citizen's live GPS position, so a report is tied to where the person
// actually is. GPS is NEVER started on load: the citizen taps "Use my current
// location", reads the GPS notice (components/GpsConsentNotice), and only then
// does the browser's permission prompt fire. They can decline and pick a
// known area / any city instead ("Enter manually"). The map then shows their
// position with a pin, and the street address is looked up for that spot
// (OpenStreetMap Nominatim, no key).
//
// The first fix a browser returns is often a rough network guess, so the
// position is watched for a few seconds and the most accurate reading wins.

const pinIcon = L.divIcon({
  className: "ssb-pin",
  html: `<svg width="34" height="44" viewBox="0 0 32 40" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))"><path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 24 16 24s16-13 16-24C32 7.2 24.8 0 16 0z" fill="#1f2937" stroke="#fff" stroke-width="1.5"/><circle cx="16" cy="15.5" r="6" fill="#fff"/></svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 44],
});

const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
const REFINE_MS = 10000; // keep listening this long for a sharper fix
const GOOD_ENOUGH_M = 15;

async function reverseGeocode(latitude, longitude, signal) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${latitude}&lon=${longitude}`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("lookup failed");
  const data = await res.json();
  return data.display_name ?? null;
}

const coordsLabel = (lat, lng) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

function Follow({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.setView([point.latitude, point.longitude], 18);
  }, [point?.latitude, point?.longitude, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Props:
 * - value: { address, latitude, longitude, accuracy, source: "gps" | "manual" } | null  (accuracy is GPS only)
 * - onChange(value | null)
 * - extra: fields merged into the value (e.g. the bin/toilet this report is about)
 */
export default function ComplaintLocationPicker({ value, onChange, extra }) {
  const profile = useProfile("citizen");
  const [status, setStatus] = useState("idle"); // idle | locating | error
  const [errorText, setErrorText] = useState("");
  const [mode, setMode] = useState("gps"); // gps | manual
  const [lookingUp, setLookingUp] = useState(false);
  const watchRef = useRef(null);
  const stopTimerRef = useRef(null);
  const lookupRef = useRef(null);
  const bestRef = useRef(null);
  const addressFor = useRef({ key: "", text: "" });
  const onChangeRef = useRef(onChange);
  const extraRef = useRef(extra);
  useEffect(() => {
    onChangeRef.current = onChange;
    extraRef.current = extra;
  });

  const stopWatch = useCallback(() => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    clearTimeout(stopTimerRef.current);
  }, []);

  const publish = useCallback((latitude, longitude, accuracy, address) => {
    onChangeRef.current({
      ...(extraRef.current ?? {}),
      address,
      latitude,
      longitude,
      accuracy,
      source: "gps",
    });
  }, []);

  const resolveAddress = useCallback(
    async (latitude, longitude, accuracy) => {
      const key = `${latitude},${longitude}`;
      // Show the pin straight away with coordinates, then swap in the address.
      publish(latitude, longitude, accuracy, addressFor.current.key === key ? addressFor.current.text : coordsLabel(latitude, longitude));
      if (addressFor.current.key === key) return;
      lookupRef.current?.abort();
      const controller = new AbortController();
      lookupRef.current = controller;
      setLookingUp(true);
      try {
        const text = await reverseGeocode(latitude, longitude, controller.signal);
        if (text) {
          addressFor.current = { key, text };
          publish(latitude, longitude, accuracy, text);
        }
      } catch {
        // offline or rate limited — the coordinates stay as the address
      } finally {
        if (lookupRef.current === controller) setLookingUp(false);
      }
    },
    [publish]
  );

  const locate = useCallback(() => {
    const blocker = gpsBlocker();
    if (blocker) {
      setErrorText(blocker);
      setStatus("error");
      return;
    }
    stopWatch();
    bestRef.current = null;
    setErrorText("");
    setStatus("locating");

    const onFix = (pos) => {
      const accuracy = Math.round(pos.coords.accuracy);
      // Keep only readings that are sharper than the best one so far.
      if (bestRef.current && accuracy >= bestRef.current) return;
      bestRef.current = accuracy;
      setStatus("idle");
      resolveAddress(
        Number(pos.coords.latitude.toFixed(6)),
        Number(pos.coords.longitude.toFixed(6)),
        accuracy
      );
      if (accuracy <= GOOD_ENOUGH_M) stopWatch();
    };
    const onFail = (err) => {
      if (bestRef.current != null) return; // already have a usable fix
      stopWatch();
      setErrorText(gpsErrorMessage(err));
      setStatus("error");
    };

    watchRef.current = navigator.geolocation.watchPosition(onFix, onFail, GPS_OPTIONS);
    stopTimerRef.current = setTimeout(stopWatch, REFINE_MS);
  }, [resolveAddress, stopWatch]);

  // Nothing starts the GPS on its own; just clean up if the screen closes.
  useEffect(
    () => () => {
      stopWatch();
      lookupRef.current?.abort();
    },
    [stopWatch]
  );

  // GPS starts only from request(), after the notice. "Enter manually" swaps
  // the map for the known-area / city picker.
  const gps = useGpsConsent({ run: locate, onManual: () => switchToManual() });

  const switchToManual = () => {
    stopWatch();
    lookupRef.current?.abort();
    setLookingUp(false);
    setStatus("idle");
    setErrorText("");
    setMode("manual");
    if (value?.source === "gps") onChange(null);
  };

  const switchToGps = () => {
    setMode("gps");
    if (value?.source === "manual") onChange(null);
  };

  const pinned = value ? { latitude: value.latitude, longitude: value.longitude } : null;
  const start = pinned ?? cityCenter(profile);

  const accuracyWarning = value?.source === "gps" ? lowAccuracyMessage(value.accuracy) : null;

  if (mode === "manual") {
    return (
      <div className="flex flex-col gap-3">
        <IndiaLocationPicker
          id="complaint-location"
          value={value?.source === "manual" ? value : null}
          onChange={(loc) => onChange(loc ? { ...(extra ?? {}), ...loc, source: "manual" } : null)}
          presets={cityPresets(profile)}
          presetsLabel="Your city"
          allowGps={false}
        />
        <button type="button" onClick={switchToGps} className="self-start text-xs font-semibold text-emerald-700 underline">
          Use my GPS location instead
        </button>
        <p className="text-[11px] text-emerald-800/50">
          Your location is only used to tag this report and is shared with the government and worker teams handling it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative isolate overflow-hidden rounded-2xl border border-emerald-100">
        <MapContainer
          center={[start.latitude, start.longitude]}
          zoom={pinned ? 18 : 16}
          className="h-60 w-full"
          scrollWheelZoom={false}
          dragging
          doubleClickZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Follow point={pinned} />
          {pinned && value.accuracy > 15 && (
            <Circle
              center={[pinned.latitude, pinned.longitude]}
              radius={value.accuracy}
              pathOptions={{ color: "#0284c7", weight: 1, fillColor: "#0284c7", fillOpacity: 0.12 }}
              interactive={false}
            />
          )}
          {pinned && <Marker position={[pinned.latitude, pinned.longitude]} icon={pinIcon} interactive={false} />}
        </MapContainer>

        <button
          type="button"
          onClick={gps.request}
          disabled={gps.asking}
          aria-label="Use my current location"
          className="absolute right-3 top-3 z-[500] flex h-10 w-10 items-center justify-center rounded-md bg-white text-slate-700 shadow-md hover:bg-slate-50"
        >
          {status === "locating" ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 11-9-9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3.5" fill="currentColor" />
              <circle cx="12" cy="12" r="7.5" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          )}
        </button>

        {!pinned && status === "locating" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center">
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-emerald-900 shadow">
              Getting your exact location…
            </span>
          </div>
        )}
      </div>

      {gps.asking && <GpsConsentNotice className="mt-2" onAllow={gps.allow} onManual={gps.decline} />}

      {!gps.asking && !value && status === "idle" && (
        <button
          type="button"
          onClick={gps.request}
          className="mt-2 min-h-[44px] w-full rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Use my current location
        </button>
      )}

      {status === "error" && (
        <GpsAlert tone="error" className="mt-2">
          <p>{errorText}</p>
          <div className="mt-1.5 flex gap-4">
            <button type="button" onClick={gps.request} className="font-semibold underline">
              Try again
            </button>
            <button type="button" onClick={gps.decline} className="font-semibold underline">
              Enter manually
            </button>
          </div>
        </GpsAlert>
      )}

      {accuracyWarning && <GpsAlert className="mt-2">{accuracyWarning}</GpsAlert>}

      <p className="mt-3 text-xs font-semibold text-emerald-900/70">Your location</p>
      <div className="mt-1 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
        <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" fill="currentColor" aria-hidden="true">
          <path d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12zm0-9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950" data-testid="gps-address">
            {value ? value.address : "Tap “Use my current location” to add it"}
          </p>
          {value && (
            <p className="text-[11px] text-emerald-800/60">
              {coordsLabel(value.latitude, value.longitude)} · ±{value.accuracy} m
              {lookingUp ? " · finding address…" : ""}
            </p>
          )}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-emerald-800/50">
        Your location is only used to tag this report and is shared with the government and worker teams handling it.
      </p>
    </div>
  );
}
