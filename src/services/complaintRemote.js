// Complaints through the EcoSetu API (VITE_USE_API=true). Used by
// complaintService.js, which keeps the same function names for every screen.
//
// Like locationStore.js: the signed-in user's complaints (own, assigned or all,
// as the server decides) are kept in memory, so screens read them
// synchronously, and refreshed after every write, every POLL_MS while
// something is listening, and on demand. Writes return Promises that reject
// with the server's message and per-field errors.

import { api, apiAll } from "./api";
import { createPoller } from "../utils/poller";

const state = { list: [], loaded: false, error: null };
const listeners = new Set();
let inflight = null;
let lastItems = null; // the raw list last fetched; the same array means "unchanged"
const poller = createPoller(() => refresh());

// The API's complaint in the shape the screens use: `photo` /
// `resolutionPhoto` are authenticated URLs, shown by components/ProtectedImage.
export function fromApi(c) {
  return { ...c, photo: c.photoUrl ?? null, resolutionPhoto: c.resolutionPhotoUrl ?? null };
}

function notify() {
  for (const cb of listeners) {
    try {
      cb(state.list);
    } catch {
      // a misbehaving subscriber must not break the store
    }
  }
}

export function refresh() {
  inflight ??= (async () => {
    try {
      // Conditional: an unchanged list comes back as the same array (304s).
      const items = await apiAll("/complaints", "items", { conditional: true });
      if (items === lastItems && state.loaded && !state.error) return; // nothing new: no re-render
      lastItems = items;
      Object.assign(state, { list: items.map(fromApi), loaded: true, error: null });
      notify();
    } catch (error) {
      state.error = error;
      notify();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export const getAll = () => state.list;
export const getById = (id) => state.list.find((c) => c.id === id) ?? null;
export const getStatus = () => ({ loaded: state.loaded, error: state.error });

function replace(complaint) {
  const mapped = fromApi(complaint);
  const i = state.list.findIndex((c) => c.id === mapped.id);
  state.list = i >= 0 ? state.list.map((c, j) => (j === i ? mapped : c)) : [mapped, ...state.list];
  notify();
  return mapped;
}

/** POST /api/complaints — the server sets id, status and priority. */
export async function create(data) {
  const body = {
    issueType: data.issueType,
    description: data.description,
    location: { address: data.location.address, latitude: data.location.latitude, longitude: data.location.longitude },
    ...(data.photo ? { photo: data.photo } : {}),
  };
  const res = await api("/complaints", { method: "POST", body });
  const created = replace(res.complaint);
  // The store couldn't take the photo (e.g. over its limit): filed without it.
  return res.photoSaved === false ? { ...created, photoWarning: res.warning } : created;
}

/**
 * POST /api/complaints for a bin or toilet: the server takes the location
 * from the facility and refuses (409, with existingId) a second open report
 * by the same citizen for the same facility and category.
 */
export async function createFacility({ facilityType, facilityId, category, description, photo }) {
  const body = { facilityType, facilityId, category };
  if (description) body.description = description;
  if (photo) body.photo = photo;
  const res = await api("/complaints", { method: "POST", body });
  const created = replace(res.complaint);
  return res.photoSaved === false ? { ...created, photoWarning: res.warning } : created;
}

/** Open (not resolved) complaints about one bin or toilet. */
export async function openCount(facilityId) {
  const res = await api(`/locations/${encodeURIComponent(facilityId)}/complaints/summary`);
  return res.openCount;
}

/** PATCH /api/complaints/:id/status — the assigned worker's start / resolve. */
export async function setStatus(id, status, extra = {}) {
  const body = { status };
  if (status === "RESOLVED") {
    body.resolutionNote = extra.resolutionNote ?? "";
    if (extra.resolutionPhoto) body.resolutionPhoto = extra.resolutionPhoto;
  }
  const { complaint } = await api(`/complaints/${encodeURIComponent(id)}/status`, { method: "PATCH", body });
  return replace(complaint);
}

/** POST /api/complaints/:id/assign — officials; the server checks the worker is active. */
export async function assign(id, workerId) {
  const { complaint } = await api(`/complaints/${encodeURIComponent(id)}/assign`, { method: "POST", body: { workerId } });
  return replace(complaint);
}

/** PATCH /api/complaints/:id/priority — the only other change officials make. */
export async function setPriority(id, priority) {
  const { complaint } = await api(`/complaints/${encodeURIComponent(id)}/priority`, { method: "PATCH", body: { priority } });
  return replace(complaint);
}

/** POST /api/complaints/:id/vote — voting the same way again clears it, as in the app. */
export async function vote(id, direction) {
  const next = getById(id)?.myVote === direction ? null : direction;
  const { complaint } = await api(`/complaints/${encodeURIComponent(id)}/vote`, { method: "POST", body: { direction: next } });
  return replace(complaint);
}

/** Listen, and poll (visible tab only, every 30 s) while anyone listens. */
export function subscribe(callback) {
  listeners.add(callback);
  poller.start();
  return () => {
    listeners.delete(callback);
    if (!listeners.size) poller.stop();
  };
}

/** Listen without starting the poller (tests). */
export function subscribeQuiet(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Forget everything (sign-in / sign-out), so one user's complaints never show to the next. */
export function reset() {
  lastItems = null;
  Object.assign(state, { list: [], loaded: false, error: null });
  notify();
}
