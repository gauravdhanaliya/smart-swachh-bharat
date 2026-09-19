import { useCallback, useEffect, useState } from "react";

// Citizen-facing app preferences (notification categories).
//
// These are real switches, not decoration: `complaintUpdates` and
// `resolutionAlerts` filter the feed built in utils/citizenNotifications.js.
// Same localStorage pattern as useCity.js.
const STORAGE_KEY = "ssb_citizen_prefs_v1";

export const DEFAULT_PREFERENCES = {
  complaintUpdates: true, // "assigned" / "work started" entries
  resolutionAlerts: true, // "resolved" entries
};

function readPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch {
    // Corrupt/blocked storage — fall back to defaults below.
  }
  return { ...DEFAULT_PREFERENCES };
}

// Preferences are read from several screens at once (Profile, the
// notifications page, the bell badge on Home), so changes are broadcast
// rather than trapped in whichever component happened to write them.
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // A misbehaving subscriber shouldn't break the store.
    }
  });
}

export function getPreferences() {
  return readPreferences();
}

export function setPreference(key, value) {
  const next = { ...readPreferences(), [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage blocked — the change still applies for this session
  }
  notify();
  return next;
}

export function useCitizenPreferences() {
  const [preferences, setPreferences] = useState(readPreferences);

  useEffect(() => {
    const refresh = () => setPreferences(readPreferences());
    listeners.add(refresh);
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Writes go through the store and come back via notify(), so every
  // subscribed screen updates together instead of each keeping its own copy.
  const update = useCallback((key, value) => {
    setPreference(key, value);
  }, []);

  const toggle = useCallback((key) => {
    setPreference(key, !readPreferences()[key]);
  }, []);

  return { preferences, update, toggle };
}
