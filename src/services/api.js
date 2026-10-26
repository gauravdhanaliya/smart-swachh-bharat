// Local, in-browser stand-in for the EcoSetu API (server/).
//
// The web app runs with no backend (Vercel serves only the static app), so
// `api(path, opts)` answers the same paths with the same response shapes as
// server/src/app.js — and reuses the server's own validation and constants —
// but keeps the records in this browser's localStorage. The services above
// it (locationStore, facilityService, facilityRequestService) don't know the
// difference. Role checks use the local session. It starts empty: bins,
// toilets and buildings come only from officials and approved requests.

import { ValidationError, cleanText, validateLocation, validateRequest } from "../../server/src/validate.js";
import { ADMIN_ROLES, REQUEST_FACILITY_TYPES, REQUEST_STATUS } from "../../server/src/constants.js";
import { readSession } from "./authSession";

const STORAGE_KEY = "ssb_local_api_v1";

export class ApiError extends Error {
  constructor(message, { status = 0, fields = null } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));

// ---- storage ---------------------------------------------------------

const ID_PREFIX = { dustbin: "DB-", public_toilet: "PT-" };
const idPrefix = (type) => ID_PREFIX[type] ?? (type === "campus" ? "CP-" : "BL-");

function nextId(prefix, rows) {
  const max = rows
    .filter((r) => r.id.startsWith(prefix))
    .map((r) => parseInt(r.id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function insertLocation(db, loc) {
  const id = loc.id ?? nextId(idPrefix(loc.type), db.locations);
  const ts = loc.createdAt ?? now();
  db.locations.push({
    id,
    name: loc.name,
    type: loc.type,
    latitude: loc.latitude,
    longitude: loc.longitude,
    description: loc.description ?? "",
    address: loc.address ?? "",
    status: loc.status,
    details: loc.details ?? {},
    source: loc.source,
    requestId: loc.requestId ?? null,
    createdBy: loc.createdBy,
    createdAt: ts,
    updatedAt: loc.updatedAt ?? ts,
    isDemo: Boolean(loc.isDemo),
    deletedAt: null,
    deletedBy: null,
    deleteReason: null,
  });
  return id;
}

function insertRequest(db, r) {
  const id = r.id ?? nextId(`FR-${new Date().getFullYear()}-`, db.requests);
  const ts = r.createdAt ?? now();
  db.requests.push({
    id,
    facilityType: r.facilityType,
    suggestedName: r.suggestedName,
    address: r.address,
    latitude: r.latitude,
    longitude: r.longitude,
    reason: r.reason,
    description: r.description ?? "",
    priority: r.priority,
    photo: r.photo ?? null,
    status: r.status ?? REQUEST_STATUS.PENDING,
    rejectionReason: r.rejectionReason ?? "",
    requestedByUser: r.requestedByUser,
    requestedByWorkerId: r.requestedByWorkerId,
    requestedByWorkerName: r.requestedByWorkerName ?? "",
    reviewedBy: r.reviewedBy ?? null,
    isDemo: Boolean(r.isDemo),
    createdAt: ts,
    updatedAt: r.updatedAt ?? ts,
  });
  return id;
}

// Turns an approved request into a map-visible location (as server/src/db.js does).
function publishRequest(db, req, approver) {
  const type = REQUEST_FACILITY_TYPES[req.facilityType];
  const details =
    type === "dustbin"
      ? { wasteType: "Mixed Waste", fillLevel: 0 }
      : { openingHours: "Not specified yet", cleanliness: 3, facilities: ["Men", "Women"] };
  return insertLocation(db, {
    name: req.suggestedName,
    type,
    latitude: req.latitude,
    longitude: req.longitude,
    description: req.isDemo ? `DEMO — ${req.reason}` : req.reason,
    address: req.address,
    status: type === "dustbin" ? "normal" : "Open",
    details,
    source: "worker_approved",
    requestId: req.id,
    createdBy: approver,
    isDemo: Boolean(req.isDemo),
  });
}

// A fresh store is empty: nothing is seeded.
function seed() {
  return { locations: [], requests: [] };
}

// Last state this tab saw — used only while storage can't be read at all.
// Empty storage means the data was cleared, so it starts over empty.
let memory = null;

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    if (memory) return clone(memory);
  }
  try {
    const db = raw ? JSON.parse(raw) : null;
    if (Array.isArray(db?.locations) && Array.isArray(db?.requests)) return db;
  } catch {
    // malformed — start over below
  }
  // Nothing stored: start empty, and write only once something is added.
  return seed();
}

// If a request's photo pushes storage over quota, keep the request without it.
function save(db, photoRequestId = null) {
  memory = db;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    if (!photoRequestId) return;
    const req = db.requests.find((r) => r.id === photoRequestId);
    if (req) req.photo = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // keep working in memory for this tab
    }
  }
}

// ---- response shapes (server/src/db.js) ------------------------------

function locationDto(doc) {
  const { deletedAt: _a, deletedBy: _b, deleteReason: _c, ...rest } = doc;
  return clone(rest);
}

function removedDto(doc) {
  return {
    ...locationDto(doc),
    removedAt: doc.deletedAt,
    removedBy: doc.deletedBy,
    removalReason: doc.deleteReason,
  };
}

function requestDto(doc) {
  return {
    id: doc.id,
    facilityType: doc.facilityType,
    suggestedName: doc.suggestedName,
    location: { address: doc.address, latitude: doc.latitude, longitude: doc.longitude },
    reason: doc.reason,
    description: doc.description,
    priority: doc.priority,
    photo: doc.photo ?? null,
    status: doc.status,
    rejectionReason: doc.rejectionReason,
    requestedByWorkerId: doc.requestedByWorkerId,
    requestedByWorkerName: doc.requestedByWorkerName,
    reviewedBy: doc.reviewedBy ?? null,
    isDemo: Boolean(doc.isDemo),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ---- routes (server/src/app.js) --------------------------------------

const REVIEW_ROLES = ["supervisor", ...ADMIN_ROLES];

function requireRole(...roles) {
  const user = readSession();
  if (!user) throw new ApiError("Please sign in to continue.", { status: 401 });
  if (!roles.includes(user.role)) {
    throw new ApiError("You don't have permission to do that.", { status: 403 });
  }
  return user;
}

const live = (db, id) => db.locations.find((l) => l.id === id && !l.deletedAt) ?? null;

const routes = [
  ["GET", /^\/locations$/, (db) => ({
    locations: db.locations
      .filter((l) => !l.deletedAt)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(locationDto),
  })],

  ["GET", /^\/locations\/removed$/, (db) => {
    requireRole(...ADMIN_ROLES);
    return {
      locations: db.locations
        .filter((l) => l.deletedAt)
        .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
        .map(removedDto),
    };
  }],

  ["POST", /^\/locations$/, (db, _m, body) => {
    const user = requireRole(...ADMIN_ROLES);
    const data = validateLocation(body);
    const id = insertLocation(db, { ...data, source: "government", createdBy: user.name, isDemo: false });
    save(db);
    return { location: locationDto(live(db, id)) };
  }],

  ["PATCH", /^\/locations\/([^/]+)$/, (db, [id], body) => {
    requireRole(...ADMIN_ROLES);
    const existing = live(db, id);
    if (!existing) throw new ApiError("Location not found.", { status: 404 });
    if (existing.type === "campus") {
      throw new ApiError("The verified campus reference can't be edited.", { status: 403 });
    }
    Object.assign(existing, validateLocation(body, { existing }), { updatedAt: now() });
    save(db);
    return { location: locationDto(existing) };
  }],

  ["DELETE", /^\/locations\/([^/]+)$/, (db, [id], body) => {
    const user = requireRole(...ADMIN_ROLES);
    const existing = live(db, id);
    if (!existing) throw new ApiError("Location not found.", { status: 404 });
    if (existing.type === "campus") {
      throw new ApiError("The verified campus reference can't be removed.", { status: 403 });
    }
    const reason = cleanText(body?.reason ?? "", 200) || "No reason recorded";
    Object.assign(existing, { deletedAt: now(), deletedBy: user.name, deleteReason: reason });
    save(db);
    return { ok: true, id };
  }],

  ["POST", /^\/locations\/([^/]+)\/restore$/, (db, [id]) => {
    requireRole(...ADMIN_ROLES);
    const doc = db.locations.find((l) => l.id === id && l.deletedAt);
    if (!doc) throw new ApiError("No removed location with that id.", { status: 404 });
    Object.assign(doc, { deletedAt: null, deletedBy: null, deleteReason: null, updatedAt: now() });
    save(db);
    return { location: locationDto(doc) };
  }],

  // Workers see every request here; screens filter to the current worker.
  ["GET", /^\/facility-requests$/, (db) => {
    requireRole("worker", ...REVIEW_ROLES);
    return {
      requests: [...db.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(requestDto),
    };
  }],

  ["POST", /^\/facility-requests$/, (db, _m, body) => {
    const user = requireRole("worker", "supervisor");
    const data = validateRequest(body);
    const id = insertRequest(db, { ...data, requestedByUser: user.id, isDemo: false });
    save(db, id);
    return { request: requestDto(db.requests.find((r) => r.id === id)) };
  }],

  ["PATCH", /^\/facility-requests\/([^/]+)\/status$/, (db, [id], body) => {
    const user = requireRole(...REVIEW_ROLES);
    const status = body?.status;
    if (![REQUEST_STATUS.APPROVED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.UNDER_REVIEW].includes(status)) {
      throw new ApiError("Status must be APPROVED, REJECTED or UNDER_REVIEW.", { status: 400 });
    }
    if (status !== REQUEST_STATUS.UNDER_REVIEW && !ADMIN_ROLES.includes(user.role)) {
      throw new ApiError("Only a government official can approve or reject.", { status: 403 });
    }
    const rejectionReason = cleanText(body?.rejectionReason ?? "", 300);
    if (status === REQUEST_STATUS.REJECTED && !rejectionReason) {
      throw new ApiError("A rejection reason is required.", { status: 400 });
    }
    const doc = db.requests.find((r) => r.id === id);
    if (!doc) throw new ApiError("Request not found.", { status: 404 });
    if (doc.status === REQUEST_STATUS.APPROVED || doc.status === REQUEST_STATUS.REJECTED) {
      throw new ApiError(`This request was already ${doc.status.toLowerCase()}.`, { status: 409 });
    }
    Object.assign(doc, {
      status,
      rejectionReason: status === REQUEST_STATUS.REJECTED ? rejectionReason : "",
      reviewedBy: user.name,
      updatedAt: now(),
    });
    const locId = status === REQUEST_STATUS.APPROVED ? publishRequest(db, doc, user.name) : null;
    save(db);
    return { request: requestDto(doc), location: locId ? locationDto(live(db, locId)) : null };
  }],
];

/** Same contract as the old HTTP client: resolves with the response body or rejects with an ApiError. */
export async function api(path, { method = "GET", body } = {}) {
  const pathname = path.split("?")[0];
  for (const [verb, pattern, handler] of routes) {
    if (verb !== method) continue;
    const match = pattern.exec(pathname);
    if (!match) continue;
    try {
      return handler(load(), match.slice(1).map(decodeURIComponent), body);
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new ApiError("Please fix the highlighted fields.", { status: 400, fields: err.errors });
      }
      throw err;
    }
  }
  throw new ApiError("Not found.", { status: 404 });
}
