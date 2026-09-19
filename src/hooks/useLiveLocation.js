import { useCallback, useEffect, useRef, useState } from "react";

// Continuous "my location" tracking using only the browser's built-in
// Geolocation API — the same blue-dot-with-accuracy-circle behaviour
// Google Maps uses, but with zero Google APIs, keys, or billing.
//
// PRIVACY: the coordinates only ever live in memory for this browser
// tab. They are never written to storage, never sent to any Smart
// Swachh Bharat server, and never attached to a complaint unless the
// citizen explicitly reports an issue.
//
// NOTE: browsers only allow Geolocation on a secure context (HTTPS,
// or localhost). If this app is opened over plain HTTP on a phone
// (rather than a deployed HTTPS URL from Vercel/Netlify), the browser
// will refuse silently — this hook detects that case and reports it
// instead of leaving the button looking broken.
//
// WRONG-LOCATION FIX: the browser has two very different ways of
// answering "where am I" —
//   1. the device GPS chip (accuracy ~5-30 m, phones only), and
//   2. network lookup — Wi-Fi SSIDs / cell towers / IP address
//      (accuracy anywhere from 100 m to several hundred km, and on a
//      laptop or over a VPN/mobile-data ISP it can resolve to a
//      completely different city).
// The network answer almost always arrives FIRST, and it reports a
// small, confident-looking `accuracy` even when the city is wrong.
// So this hook:
//   * never reuses a cached fix (maximumAge: 0) — a stale fix from a
//     different network was a common source of the wrong city,
//   * keeps the watch open for a refinement window and holds on to the
//     MOST ACCURATE fix seen instead of the latest one, so the slower
//     GPS fix replaces the quick network guess,
//   * flags a coarse fix as `approximate` so the UI can say so and
//     offer a manual override instead of silently showing Kolkata to a
//     user sitting in Meerut.
const REFINE_WINDOW_MS = 25000; // keep listening this long for a better fix
const COARSE_ACCURACY_M = 300; // worse than this = not a real GPS fix

export function useLiveLocation() {
  const [position, setPosition] = useState(null); // { lat, lng, accuracy, heading }
  const [tracking, setTracking] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | locating | active | error
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);
  const startedAtRef = useRef(0);
  const bestRef = useRef(null);

  const isSecure = typeof window === "undefined" || window.isSecureContext;
  const hasApi = typeof navigator !== "undefined" && "geolocation" in navigator;
  const supported = hasApi && isSecure;

  const stop = useCallback(() => {
    if (watchIdRef.current != null && hasApi) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setTracking(false);
    setStatus((current) => (current === "error" ? current : "idle"));
  }, [hasApi]);

  const start = useCallback(() => {
    if (!hasApi) {
      setError("Geolocation isn't supported in this browser.");
      setStatus("error");
      return;
    }
    if (!isSecure) {
      setError("Live location needs a secure (HTTPS) connection to work.");
      setStatus("error");
      return;
    }

    // Always restart clean so a retry can't inherit the earlier bad fix.
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    bestRef.current = null;
    startedAtRef.current = Date.now();

    setStatus("locating");
    setError(null);
    setTracking(true);
    setPosition(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? Number.POSITIVE_INFINITY,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          timestamp: pos.timestamp,
        };

        const best = bestRef.current;
        const refining = Date.now() - startedAtRef.current < REFINE_WINDOW_MS;

        // During the refinement window, ignore any fix that is worse
        // than the best one so far — that's the network guess trying to
        // overwrite a good GPS lock. After the window, the user may
        // genuinely have moved, so take whatever comes in.
        if (best && refining && next.accuracy > best.accuracy) return;

        bestRef.current = next;
        setPosition(next);
        setError(null);
        setStatus("active");
      },
      (err) => {
        // A later failure shouldn't throw away a fix we already have.
        if (bestRef.current) {
          setError("Couldn't refine your location any further.");
          return;
        }
        setTracking(false);
        setStatus("error");
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission denied. Allow location for this site, then try again.");
        } else if (err.code === err.TIMEOUT) {
          setError("Couldn't get a location fix in time. Try again outdoors, or set your area manually.");
        } else {
          setError("Location unavailable right now. You can set your area manually instead.");
        }
      },
      // maximumAge: 0 — never accept a cached fix; that's what made the
      // map open on an old/other-network city.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [hasApi, isSecure]);

  // Always clear the watch when the map screen unmounts.
  useEffect(() => stop, [stop]);

  const approximate = position != null && position.accuracy > COARSE_ACCURACY_M;

  return { position, tracking, status, error, supported, approximate, start, stop };
}

export { COARSE_ACCURACY_M };
