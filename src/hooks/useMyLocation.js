import { useCallback, useRef, useState } from "react";
import { gpsBlocker } from "../utils/gps";

const MESSAGES = {
  1: "Location is blocked for this site. Allow it in your browser's site settings to sort by distance.",
  3: "Finding your location took too long. Try again.",
};

/**
 * The device's position, asked for only when `locate()` is called (a tap on
 * "Use my location"), never on page load. Kept in memory for this screen
 * only: not stored, not sent anywhere.
 * status: "idle" | "locating" | "ready" | "error"
 */
export function useMyLocation() {
  const [state, setState] = useState({ status: "idle", position: null, message: "" });
  const busy = useRef(false);

  const locate = useCallback(() => {
    if (busy.current) return;
    const blocked = gpsBlocker();
    if (blocked) {
      setState({ status: "error", position: null, message: blocked });
      return;
    }
    busy.current = true;
    setState((s) => ({ ...s, status: "locating", message: "" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        busy.current = false;
        setState({ status: "ready", position: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }, message: "" });
      },
      (err) => {
        busy.current = false;
        setState({ status: "error", position: null, message: MESSAGES[err?.code] ?? "Your location isn't available right now. Try again." });
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  }, []);

  return { ...state, locate };
}
