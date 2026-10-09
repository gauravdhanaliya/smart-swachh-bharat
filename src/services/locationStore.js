// Client-side cache of the server's shared data (locations + facility
// requests).
//
// The API is the single source of truth: every role reads the same
// /api/locations, so a facility an official adds or approves reaches the
// citizen map on the next refresh. This module keeps the last good copy in
// memory so screens can read it synchronously (getAllBins() etc.), and
// refreshes it:
//   - right after any write this tab makes,
//   - every POLL_MS while something is subscribed,
//   - when the tab regains focus or the network comes back.
// No WebSocket layer exists in this project, so polling is the "real-time"
// mechanism.

import { api, getTokenRole } from "./api";
import { splitLocations } from "./locationAdapters";

const POLL_MS = 8000;

const state = {
  locations: [],
  removed: [],
  requests: [],
  derived: { bins: [], toilets: [], buildings: [] },
  loaded: false,
  error: null,
  lastSync: null,
};

const listeners = new Set();
let timer = null;
let inflight = null;
let signature = "";

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // A misbehaving subscriber shouldn't break the store.
    }
  });
}

async function safe(path) {
  try {
    return await api(path);
  } catch (err) {
    // A role that isn't allowed to read a list (401/403) just gets none.
    if (err.status === 401 || err.status === 403) return null;
    throw err;
  }
}

export function refresh() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const role = getTokenRole();
      const [loc, removed, requests] = await Promise.all([
        api("/locations"),
        role === "official" || role === "superadmin" ? safe("/locations/removed") : null,
        role && role !== "citizen" ? safe("/facility-requests") : null,
      ]);

      const next = {
        locations: loc.locations,
        removed: removed?.locations ?? [],
        requests: requests?.requests ?? [],
      };
      const nextSig = JSON.stringify(next);
      const changed = nextSig !== signature || state.error !== null || !state.loaded;
      signature = nextSig;
      if (changed) {
        Object.assign(state, next, { error: null, loaded: true, lastSync: Date.now() });
        state.derived = splitLocations(next.locations);
        notify();
      } else {
        state.lastSync = Date.now();
      }
    } catch (err) {
      if (state.error?.message !== err.message) {
        state.error = err;
        notify();
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Refresh after a write: waits out any fetch already in flight (it may predate the write). */
export function refreshFresh() {
  return inflight ? inflight.then(() => refresh()) : refresh();
}

function onFocus() {
  if (document.visibilityState !== "hidden") refresh();
}

function startPolling() {
  if (timer || typeof window === "undefined") return;
  refresh();
  timer = setInterval(refresh, POLL_MS);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onFocus);
  document.addEventListener("visibilitychange", onFocus);
}

function stopPolling() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("online", onFocus);
  document.removeEventListener("visibilitychange", onFocus);
}

export function subscribe(callback) {
  listeners.add(callback);
  startPolling();
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) stopPolling();
  };
}

export const getLocations = () => state.locations;
export const getRemovedLocations = () => state.removed;
export const getRequestsSnapshot = () => state.requests;
export const getDerived = () => state.derived;
export const getSyncStatus = () => ({ loaded: state.loaded, error: state.error, lastSync: state.lastSync });

/** Forget cached data (e.g. on logout) so one user's lists never leak to the next. */
export function resetStore() {
  signature = "";
  Object.assign(state, { removed: [], requests: [], error: null });
  notify();
}
