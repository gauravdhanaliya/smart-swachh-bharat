// Client-side cache of the shared data (locations + facility requests).
//
// The API (services/api.js — local to this browser in the demo build) is the
// single source of truth: every role reads the same /locations, so a facility
// an official adds or approves reaches the citizen map on the next refresh,
// including in other tabs. This module keeps the last good copy in
// memory so screens can read it synchronously (getAllBins() etc.), and
// refreshes it:
//   - right after any write this tab makes,
//   - every POLL_MS while something is subscribed,
//   - when the tab regains focus or the network comes back.
// No WebSocket layer exists in this project, so polling is the "real-time"
// mechanism.

import { api, apiAll } from "./api";
import { readSession } from "./authSession";
import { splitLocations } from "./locationAdapters";
import { apiEnabled } from "./apiConfig";
import { getSessionClient } from "./session";
import { createPoller } from "../utils/poller";

const currentRole = () => (apiEnabled() ? getSessionClient().getUser()?.role : readSession()?.role);

// A row of GET /api/locations/map as a location record. It is "slim": detail
// screens fetch the full record (hooks/useLocationDetail.js).
function fromMapItem(i) {
  return {
    id: i.id,
    name: i.name,
    type: i.type,
    latitude: i.latitude,
    longitude: i.longitude,
    status: i.status,
    ...(i.statusSource ? { statusSource: i.statusSource } : {}),
    isDemo: i.isDemo,
    source: i.isDemo ? "demo" : "government",
    description: i.isDemo ? "DEMO" : "",
    address: "",
    details: {},
    ratingAverage: i.ratingAverage,
    slim: true,
  };
}

// A facility request from the API, in the shape the screens use (`photo` is
// the authenticated photo URL, shown by components/ProtectedImage).
export const requestFromApi = (r) => ({ ...r, photo: r.photoUrl ?? r.photo ?? null });

async function safeAll(path, key) {
  try {
    return await apiAll(path, key, { conditional: true });
  } catch (err) {
    if (err.status === 401 || err.status === 403) return null;
    throw err;
  }
}

/**
 * API mode: the map's bins and toilets come from one call to
 * /api/locations/map; buildings (a few dozen) from ?kind=building. Officials
 * manage facilities, so they get the full records instead.
 */
async function fetchFromApi(role) {
  const admin = role === "official" || role === "superadmin";
  const [facilities, buildings, removed, requests] = await Promise.all([
    admin
      ? apiAll("/locations?kind=facility", "locations", { conditional: true })
      : api("/locations/map", { conditional: true }).then((r) => r.items.map(fromMapItem)),
    apiAll("/locations?kind=building", "locations", { conditional: true }),
    admin ? safeAll("/locations/removed", "locations") : null,
    role && role !== "citizen" ? safeAll("/facility-requests", "requests") : null,
  ]);
  return { locations: [...facilities, ...buildings], removed: removed ?? [], requests: (requests ?? []).map(requestFromApi) };
}

// Polled every 30 s, only while the tab is visible (utils/poller.js).

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
let inflight = null;
let polling = false;
const poller = createPoller(() => refresh());
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
      const role = currentRole();
      let next;
      if (apiEnabled()) {
        next = await fetchFromApi(role);
      } else {
        const [loc, removed, requests] = await Promise.all([
          api("/locations"),
          role === "official" || role === "superadmin" ? safe("/locations/removed") : null,
          role && role !== "citizen" ? safe("/facility-requests") : null,
        ]);
        next = {
          locations: loc.locations,
          removed: removed?.locations ?? [],
          requests: requests?.requests ?? [],
        };
      }
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

// Coming back online refreshes at once (if the tab is visible).
function onOnline() {
  if (document.visibilityState !== "hidden") refresh();
}

function startPolling() {
  if (polling || typeof window === "undefined") return;
  polling = true;
  poller.start();
  window.addEventListener("online", onOnline);
}

function stopPolling() {
  if (!polling) return;
  polling = false;
  poller.stop();
  window.removeEventListener("online", onOnline);
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
  if (apiEnabled()) Object.assign(state, { locations: [], derived: { bins: [], toilets: [], buildings: [] }, loaded: false });
  notify();
}
