// Custom locations the citizen adds themselves.
//
// The built-in list in data/cities.js covers six Uttar Pradesh cities —
// fine for the demo, useless if you actually live in Ghaziabad or want
// to watch a specific ward. This module lets a citizen add their own
// point (by GPS or by coordinates) and have every city-aware screen
// treat it exactly like a built-in one.
//
// Same shape and same localStorage-with-listeners pattern as
// services/facilityService.js, so swapping it for a real
// `GET/POST /api/locations` later won't touch any UI code.

import { CITIES, DEFAULT_CITY_ID } from "../data/cities";

const STORAGE_KEY = "ssb_custom_cities_v1";

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

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Corrupt/blocked storage — behave as if none were added.
  }
  return [];
}

function write(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota/private browsing — the change still applies this session.
  }
  notify();
  return list;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) notify();
  });
}

export function getCustomCities() {
  return read();
}

/** Built-in cities first, then anything the citizen added. */
export function getAllCities() {
  return [...CITIES, ...read()];
}

export function findCity(id) {
  return getAllCities().find((c) => c.id === id) ?? null;
}

export const LOCATION_LIMITS = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
};

/**
 * Validates a custom location before it's saved. Returns a map of field
 * errors — empty means it's good. Kept here rather than in the dialog so
 * the same rules apply wherever a location gets added.
 */
export function validateCustomCity({ name, latitude, longitude }) {
  const errors = {};
  if (!name || !name.trim()) {
    errors.name = "Give this place a name you'll recognise.";
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (latitude === "" || latitude == null || Number.isNaN(lat)) {
    errors.latitude = "Enter a latitude, or use your current location.";
  } else if (lat < LOCATION_LIMITS.latitude.min || lat > LOCATION_LIMITS.latitude.max) {
    errors.latitude = "Latitude must be between -90 and 90.";
  }

  if (longitude === "" || longitude == null || Number.isNaN(lng)) {
    errors.longitude = "Enter a longitude, or use your current location.";
  } else if (lng < LOCATION_LIMITS.longitude.min || lng > LOCATION_LIMITS.longitude.max) {
    errors.longitude = "Longitude must be between -180 and 180.";
  }

  return errors;
}

/**
 * POST /api/locations — adds a custom location and returns it.
 * Assumes the caller has already run validateCustomCity().
 */
export function addCustomCity({ name, state, latitude, longitude }) {
  const city = {
    id: `custom-${Date.now().toString(36)}`,
    name: name.trim(),
    state: (state || "").trim(),
    latitude: Number(latitude),
    longitude: Number(longitude),
    custom: true,
  };
  write([...read(), city]);
  return city;
}

/** DELETE /api/locations/:id. Built-in cities can't be removed. */
export function removeCustomCity(id) {
  const next = read().filter((c) => c.id !== id);
  write(next);
  return next;
}

export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export { DEFAULT_CITY_ID };
