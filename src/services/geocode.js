// Place search and street addresses (OpenStreetMap Nominatim), used by the
// map search and the complaint location picker.
//
// Nominatim's usage policy, on this side:
//   * search only when the user presses Search or Enter (never while typing);
//   * at most one request a second from this tab: a second search waits for
//     its turn, and pressing Search again for the same words reuses the
//     answer or the request still in flight;
//   * every answer is cached for the browser session.
// Through the API (VITE_USE_API=true) the server adds the rest: one request a
// second for the whole app, the app's User-Agent and a shared cache
// (server/src/geocode.js). The browser-only build calls Nominatim directly
// (services/api.js, /geo routes).

import { api } from "./api";
import { GEO_BUSY_MESSAGE, normaliseQuery, roundCoord } from "../../server/src/geo-shared.js";

export { GEO_BUSY_MESSAGE };
export const MIN_GAP_MS = 1000;
const STORAGE_KEY = "ssb_geo_cache_v1";
const MAX_ENTRIES = 200;

function loadCache() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return new Map(Array.isArray(entries) ? entries : []);
  } catch {
    return new Map();
  }
}

function saveCache(cache) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...cache].slice(-MAX_ENTRIES)));
  } catch {
    // storage full or blocked: the in-memory cache still works
  }
}

export function createGeocoder({ call = api, now = () => Date.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const cache = loadCache();
  const pending = new Map();
  let nextFree = 0;

  function run(key, path) {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      // Reserve the next free second before waiting, so two searches started
      // together are still a second apart.
      const startAt = Math.max(now(), nextFree);
      nextFree = startAt + MIN_GAP_MS;
      if (startAt > now()) await wait(startAt - now());
      try {
        const value = await call(path);
        cache.set(key, value);
        saveCache(cache);
        return value;
      } catch (err) {
        if (err?.status === 429) {
          const busy = new Error(GEO_BUSY_MESSAGE);
          busy.status = 429;
          throw busy;
        }
        throw err;
      }
    })().finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  }

  return {
    /** Places in India matching the words: [{ label, latitude, longitude, wide }]. */
    async searchPlaces(q) {
      const key = normaliseQuery(q);
      if (key.length < 2) return [];
      const words = String(q).trim().replace(/\s+/g, " ").slice(0, 100);
      const res = await run(`search:${key}`, `/geo/search?q=${encodeURIComponent(words)}`);
      return res?.results ?? [];
    },

    /** The street address at a point, or null. */
    async reverseGeocode(latitude, longitude) {
      const lat = roundCoord(latitude);
      const lon = roundCoord(longitude);
      const res = await run(`reverse:${lat},${lon}`, `/geo/reverse?lat=${lat}&lon=${lon}`);
      return res?.address ?? null;
    },
  };
}

// The app shares one geocoder, so the one-a-second spacing covers every screen.
let shared = null;
const geocoder = () => (shared ??= createGeocoder());
export const searchPlaces = (q) => geocoder().searchPlaces(q);
export const reverseGeocode = (lat, lon) => geocoder().reverseGeocode(lat, lon);

/** Forget the shared geocoder (tests). The session cache in sessionStorage is cleared separately. */
export function resetGeocoder() {
  shared = null;
}
