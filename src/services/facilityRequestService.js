// Step 14A — Worker "Request Facility" data store.
//
// Mirrors services/complaintService.js exactly: for this prototype, data
// lives in localStorage. When a real backend is ready, only the internals
// of this file (readAll / writeAll) need to change — every screen already
// calls getFacilityRequests / createFacilityRequest / etc., not
// localStorage directly.
//
// Future REST endpoints this file stands in for:
//   POST /api/facility-requests
//   GET  /api/facility-requests
//   GET  /api/facility-requests/:id

import {
  REQUEST_STATUS,
  FACILITY_REQUEST_ID_PREFIX,
  SEED_FACILITY_REQUESTS,
  isoNow,
} from "../data/facilityRequests";

const STORAGE_KEY = "ssb_facility_requests_v1";

const listeners = new Set();

function notify(list) {
  listeners.forEach((cb) => {
    try {
      cb(list);
    } catch {
      // A misbehaving subscriber shouldn't break the store.
    }
  });
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupt/blocked storage — fall back to seed data below.
  }
  writeAll(SEED_FACILITY_REQUESTS, { silent: true });
  return SEED_FACILITY_REQUESTS;
}

function writeAll(list, { silent = false } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage unavailable (e.g. private browsing).
    // The in-memory list still updates for this session so the demo
    // can continue even if persistence silently fails.
  }
  if (!silent) notify(list);
  return list;
}

// Keep every open tab/component in sync when storage changes elsewhere.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      try {
        notify(event.newValue ? JSON.parse(event.newValue) : []);
      } catch {
        // ignore malformed cross-tab payloads
      }
    }
  });
}

function generateRequestId(existing) {
  const numbers = existing
    .map((r) => r.id)
    .filter((id) => id.startsWith(FACILITY_REQUEST_ID_PREFIX))
    .map((id) => parseInt(id.slice(FACILITY_REQUEST_ID_PREFIX.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${FACILITY_REQUEST_ID_PREFIX}${String(next).padStart(3, "0")}`;
}

/** GET /api/facility-requests — all requests, newest first. */
export function getFacilityRequests() {
  return [...readAll()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** GET /api/facility-requests — scoped to one worker (their own requests only). */
export function getFacilityRequestsForWorker(workerId) {
  return getFacilityRequests().filter((r) => r.requestedByWorkerId === workerId);
}

/** GET /api/facility-requests/:id */
export function getFacilityRequestById(id) {
  return readAll().find((r) => r.id === id) ?? null;
}

/**
 * POST /api/facility-requests
 * Creates a new facility request from validated worker input and returns it.
 * `data` should already be sanitized/validated by the caller (WorkerRequestFacility).
 * A Worker may only create requests and view their own — this module has no
 * approve/reject/publish function on purpose (that's a Government capability
 * for a later step).
 */
export function createFacilityRequest(data) {
  const all = readAll();
  const now = isoNow();
  const request = {
    id: generateRequestId(all),
    facilityType: data.facilityType,
    suggestedName: data.suggestedName,
    location: data.location, // { address, latitude, longitude }
    reason: data.reason,
    description: data.description ?? "",
    priority: data.priority,
    photo: data.photo ?? null,
    status: REQUEST_STATUS.PENDING,
    rejectionReason: "",
    requestedByWorkerId: data.requestedByWorkerId,
    requestedByWorkerName: data.requestedByWorkerName,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };

  const next = [...all, request];
  return tryWriteWithPhotoFallback(next, request.id);
}

// If storing the photo pushes the payload over the browser's storage
// quota, drop just the photo and keep the request (never lose the
// worker's submission over an image that's too large for the demo).
function tryWriteWithPhotoFallback(list, newRequestId) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    notify(list);
  } catch {
    const withoutPhoto = list.map((r) =>
      r.id === newRequestId ? { ...r, photo: null } : r
    );
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutPhoto));
    } catch {
      // Give up on persistence but keep working in-memory for this session.
    }
    notify(withoutPhoto);
    return withoutPhoto.find((r) => r.id === newRequestId);
  }
  return list.find((r) => r.id === newRequestId);
}

/**
 * PATCH /api/facility-requests/:id — Government-only status transition
 * (approve / reject / move to under review). This is the missing half of
 * Step 14A: workers can only create + view their own requests; only this
 * function moves a request to APPROVED, which is what makes it eligible
 * to appear as a real facility on the Government and Citizen maps (see
 * services/facilityService.js).
 */
export function updateFacilityRequestStatus(id, status, extra = {}) {
  const all = readAll();
  const now = isoNow();
  let updated = null;
  const next = all.map((r) => {
    if (r.id !== id) return r;
    updated = {
      ...r,
      status,
      rejectionReason: status === REQUEST_STATUS.REJECTED ? extra.rejectionReason ?? "" : "",
      updatedAt: now,
    };
    return updated;
  });
  writeAll(next);
  return updated;
}

/** Subscribes to any change in the facility-request list. Returns an unsubscribe fn. */
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Demo/dev helper — wipes any facility requests created during the session
 * and restores the predefined seed requests (FR-2026-001..003) so the demo
 * can be re-run from a clean, known state.
 */
export function resetDemoData() {
  const fresh = SEED_FACILITY_REQUESTS.map((r) => ({ ...r }));
  writeAll(fresh);
  return fresh;
}
