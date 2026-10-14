// Shared rules for every "use my GPS location" button in the app: the
// pre-prompt acknowledgement (remembered for this browser session only),
// plain-language failure messages, and the low-accuracy warning.
//
// Coordinates are never stored here — callers keep them in their own form
// state, exactly as before.

export const LOW_ACCURACY_M = 100;

// sessionStorage, not localStorage: the notice comes back next session.
const ACK_KEY = "ssb_gps_ack_v1";

export function hasGpsAck() {
  try {
    return sessionStorage.getItem(ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberGpsAck() {
  try {
    sessionStorage.setItem(ACK_KEY, "1");
  } catch {
    // storage blocked — the notice just shows again next time
  }
}

/** Why GPS can't be used at all in this browser/page, or null if it can. */
export function gpsBlocker() {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return "This browser doesn't support GPS. Please enter your location manually.";
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "GPS needs a secure (HTTPS) connection, and this page isn't using one. Open the app over HTTPS, or enter your location manually.";
  }
  return null;
}

/** Plain-language message for a GeolocationPositionError. */
export function gpsErrorMessage(err) {
  switch (err?.code) {
    case 1:
      return "Location permission was denied. To turn it on, open your browser's site settings (the lock icon next to the address bar), allow Location for this site, then try again. You can also enter your location manually.";
    case 3:
      return "Getting your location took too long. Try again, or enter your location manually.";
    default:
      return "Your location isn't available right now. Check that location is turned on and try again, or enter it manually.";
  }
}

export function lowAccuracyMessage(accuracy) {
  if (!Number.isFinite(accuracy) || accuracy <= LOW_ACCURACY_M) return null;
  return `Location may be inaccurate (about ${Math.round(accuracy)} m). Please verify on the map.`;
}
