import { useEffect, useState } from "react";
import SimpleMap from "./SimpleMap";
import { useLiveLocation } from "../hooks/useLiveLocation";
import { useGpsConsent } from "../hooks/useGpsConsent";
import GpsConsentNotice, { GpsAlert } from "./GpsConsentNotice";
import { gpsBlocker, lowAccuracyMessage } from "../utils/gps";
import { validateCustomCity } from "../services/cityService";

// "Add custom location" — the escape hatch from the six built-in cities
// in data/cities.js.
//
// Two ways in, because neither works everywhere: GPS is one tap but
// needs an HTTPS page and a granted permission (see useLiveLocation for
// why it can also be wrong), while typed coordinates always work and are
// what someone demoing on a laptop will reach for. Whichever you use,
// the map preview underneath is the confirmation step — same
// pick-then-preview pattern as GovAddFacility and ReportIssue.

export default function AddLocationDialog({ onCancel, onSave, initialName = "", initialState = "" }) {
  const [name, setName] = useState(initialName);
  const [state, setState] = useState(initialState);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [errors, setErrors] = useState({});

  const {
    position,
    status,
    error: gpsError,
    supported,
    start,
    stop,
  } = useLiveLocation();

  // GPS only starts from the tap below, after the notice; "Enter manually"
  // just moves on to the coordinate fields.
  const gps = useGpsConsent({
    run: start,
    onManual: () => document.getElementById("location-lat")?.focus(),
  });

  // Stop the geolocation watch as soon as the sheet closes — it's a
  // battery drain and a privacy surprise if it keeps running.
  useEffect(() => stop, [stop]);

  // A fix arriving fills the coordinate fields; the citizen can still
  // edit them afterwards.
  useEffect(() => {
    if (!position) return;
    setLatitude(position.lat.toFixed(6));
    setLongitude(position.lng.toFixed(6));
    setErrors((current) => ({ ...current, latitude: undefined, longitude: undefined }));
  }, [position]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const lat = Number(latitude);
  const lng = Number(longitude);
  const hasCoords =
    latitude !== "" && longitude !== "" && !Number.isNaN(lat) && !Number.isNaN(lng);

  const handleSubmit = (event) => {
    event.preventDefault();
    const found = validateCustomCity({ name, latitude, longitude });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    stop();
    onSave({ name, state, latitude, longitude });
  };

  const field =
    "mt-1.5 w-full rounded-xl border border-emerald-100 bg-white px-3.5 py-2.5 text-sm text-emerald-950 placeholder:text-emerald-800/40 focus:border-emerald-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-emerald-950/40" onClick={onCancel} aria-hidden="true" />

      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-location-title"
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-emerald-100 bg-white p-5 shadow-2xl"
      >
        <h2 id="add-location-title" className="text-base font-bold text-emerald-950">
          Add a custom location
        </h2>
        <p className="mt-0.5 text-sm text-emerald-800/60">
          Track bins and toilets around any place — your ward, your campus, a relative&apos;s
          neighbourhood.
        </p>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-emerald-950" htmlFor="location-name">
            Name
          </label>
          <input
            id="location-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sector 12, Ghaziabad"
            className={field}
          />
          {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}
        </div>

        <div className="mt-3">
          <label className="block text-sm font-semibold text-emerald-950" htmlFor="location-state">
            State or district <span className="font-normal text-emerald-800/50">(optional)</span>
          </label>
          <input
            id="location-state"
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="e.g. Uttar Pradesh"
            className={field}
          />
        </div>

        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <button
            type="button"
            onClick={gps.request}
            disabled={!supported || status === "locating" || gps.asking}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="8" />
            </svg>
            {status === "locating" ? "Finding you…" : "Use my current location"}
          </button>

          {gps.asking && (
            <GpsConsentNotice className="mt-3" onAllow={gps.allow} onManual={gps.decline} />
          )}
          {!supported && <GpsAlert className="mt-2">{gpsBlocker()}</GpsAlert>}
          {gpsError && supported && (
            <GpsAlert tone="error" className="mt-2">
              {gpsError}
            </GpsAlert>
          )}
          {position && lowAccuracyMessage(position.accuracy) && (
            <GpsAlert className="mt-2">{lowAccuracyMessage(position.accuracy)}</GpsAlert>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-emerald-800/70" htmlFor="location-lat">
              Latitude
            </label>
            <input
              id="location-lat"
              type="text"
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="28.9845"
              className={field}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-emerald-800/70" htmlFor="location-lng">
              Longitude
            </label>
            <input
              id="location-lng"
              type="text"
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="77.7064"
              className={field}
            />
          </div>
        </div>
        {(errors.latitude || errors.longitude) && (
          <p className="mt-1 text-xs font-medium text-red-600">
            {errors.latitude || errors.longitude}
          </p>
        )}

        {hasCoords && (
          <SimpleMap
            latitude={lat}
            longitude={lng}
            zoom={14}
            markerLabel={name || "New location"}
            interactive={false}
            className="mt-3 h-40"
          />
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Save location
          </button>
        </div>
      </form>
    </div>
  );
}
