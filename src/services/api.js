// Local, in-browser stand-in for the EcoSetu API (server/).
//
// The demo build runs with no backend (Vercel serves only the static app), so
// `api(path, opts)` answers the same paths with the same response shapes as
// server/src/app.js — and reuses the server's own validation, constants and
// seed data — but keeps the records in this browser's localStorage. The
// services above it (locationStore, facilityService, facilityRequestService)
// don't know the difference. Role checks use the local demo session.

import { ValidationError, cleanText, pageOf, parsePage, validateLocation, validateRequest } from "../../server/src/validate.js";
import { validateConsent, validateDataDeletion, validateRating } from "../../server/src/validate-civic.js";
import { isLowRated, summarizeRatings } from "../utils/ratings";
import { GEO_BUSY_MESSAGE } from "../../server/src/geo-shared.js";
import { requestIdPrefix } from "../../server/src/ids.js";
import { ADMIN_ROLES, DEFAULT_CONSENT_VERSION, ROLES, REQUEST_FACILITY_TYPES, REQUEST_STATUS, migrateBinLocation } from "../../server/src/constants.js";
import { CAMPUS, DEMO_BINS, DEMO_BUILDINGS, DEMO_REQUESTS, DEMO_TOILETS } from "../../server/src/seed-data.js";
import { DEMO_IDS, LOGIN_METHOD, readSession } from "./authSession";
import { apiEnabled } from "./apiConfig";
import { getSessionClient } from "./session";

const STORAGE_KEY = "ssb_local_api_v1";

export class ApiError extends Error {
  constructor(message, { status = 0, fields = null, existingId = null } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.existingId = existingId;
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
    ...(loc.type === "dustbin" ? { statusSource: loc.statusSource ?? "simulated" } : {}),
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
  const id = r.id ?? nextId(requestIdPrefix(r.createdAt ?? new Date()), db.requests);
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
      ? { wasteType: "Mixed Waste" }
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

// Same seed as server/src/seed.js.
function seed() {
  const db = { locations: [], requests: [] };
  insertLocation(db, { ...CAMPUS, createdBy: "system" });
  for (const loc of [...DEMO_BUILDINGS, ...DEMO_BINS, ...DEMO_TOILETS]) insertLocation(db, { ...loc, createdBy: "system" });
  for (const r of DEMO_REQUESTS) {
    insertRequest(db, {
      ...r,
      requestedByUser: "demo-seed",
      reviewedBy: r.status === "PENDING" ? null : "system",
      isDemo: true,
      updatedAt: r.createdAt,
    });
    if (r.status === REQUEST_STATUS.APPROVED) publishRequest(db, { ...r, isDemo: true }, "system");
  }
  return db;
}

// Bins saved by older builds had a fill percentage; bring them up to date
// (status only) the first time they're loaded, and save the result.
function migrateStored(db) {
  const locations = db.locations.filter((l) => l && typeof l === "object").map(migrateBinLocation);
  const changed = locations.length !== db.locations.length || locations.some((l, i) => l !== db.locations[i]);
  if (!changed) return db;
  const next = { ...db, locations };
  save(next);
  return next;
}

// Last state this tab saw — used only while storage can't be read at all
// (blocked). Empty storage means the data was cleared (another tab, the
// browser's "clear site data"), so it starts over from the demo seed rather
// than bringing back what this tab remembered.
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
    if (Array.isArray(db?.locations) && Array.isArray(db?.requests)) return migrateStored(db);
  } catch {
    // malformed — start over below
  }
  const db = seed();
  save(db); // persist right away so seeded timestamps stay stable
  return db;
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

// Browser-only build: Nominatim is called from the browser. It can't set a
// User-Agent, so the request carries the site's origin as the Referer (which
// the policy accepts) — never "no-referrer". services/geocode.js spaces the
// calls a second apart and caches them.
const NOMINATIM = "https://nominatim.openstreetmap.org";
async function nominatim(path, params) {
  const url = new URL(path, NOMINATIM);
  for (const [k, v] of Object.entries({ format: "jsonv2", "accept-language": "en", ...params })) url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url.toString(), { headers: { Accept: "application/json" }, referrerPolicy: "strict-origin-when-cross-origin" });
  } catch {
    throw new ApiError("Place search isn't available right now. Please try again later.", { status: 502 });
  }
  if (res.status === 429 || res.status === 503) throw new ApiError(GEO_BUSY_MESSAGE, { status: 429 });
  if (!res.ok) throw new ApiError("Place search isn't available right now. Please try again later.", { status: 502 });
  return res.json();
}
const WIDE_TYPES = new Set(["country", "state", "state_district", "region", "county", "district", "city", "town", "municipality", "village", "suburb", "city_district"]);

// ---- toilet ratings (as server/src/civic.js) ----------------------------

const ratingsOf = (db, toiletId) => (db.ratings ?? []).filter((r) => r.toiletId === toiletId);
const ratingSummary = (db, toiletId) => ({ toiletId, ...summarizeRatings(ratingsOf(db, toiletId)) });
const liveToilet = (db, id) => {
  const loc = live(db, id);
  if (!loc || loc.type !== "public_toilet") throw new ApiError("Toilet not found.", { status: 404 });
  return loc;
};
const ratingDto = (r) =>
  r ? { toiletId: r.toiletId, stars: r.stars, categories: r.categories ?? {}, comment: r.comment ?? "", createdAt: r.createdAt, updatedAt: r.updatedAt } : null;
const newestFirst = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
const queryObject = (query) => Object.fromEntries(query);

// ---- consent (as server/src/routes-civic.js), one record per account ------

const CONSENT_KEY = "ssb_consent_v1";
function readConsents() {
  try {
    const all = JSON.parse(localStorage.getItem(CONSENT_KEY));
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}
function writeConsents(all) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(all));
  } catch {
    // storage blocked: the consent screen simply shows again next time
  }
}
const consentState = (consent) => ({
  version: DEFAULT_CONSENT_VERSION,
  consent: consent ?? null,
  upToDate: consent?.version === DEFAULT_CONSENT_VERSION,
});

const routes = [
  ["GET", /^\/me\/consent$/, () => {
    const user = requireRole(...ROLES);
    return consentState(readConsents()[user.id]);
  }],

  ["PUT", /^\/me\/consent$/, (_db, _m, body) => {
    const user = requireRole(...ROLES);
    const consent = validateConsent(body);
    if (consent.version !== DEFAULT_CONSENT_VERSION) {
      throw new ApiError("The privacy notice has changed. Please read it again.", { status: 409 });
    }
    const all = readConsents();
    all[user.id] = { ...consent, acceptedAt: now() };
    writeConsents(all);
    return consentState(all[user.id]);
  }],

  ["DELETE", /^\/me\/consent$/, () => {
    const user = requireRole(...ROLES);
    const all = readConsents();
    delete all[user.id];
    writeConsents(all);
    return { signedOut: true };
  }],

  ["POST", /^\/me\/consent\/reset-demo$/, () => {
    const user = requireRole(...ROLES);
    if (user.method !== LOGIN_METHOD.DEMO) throw new ApiError("Only the shared demo accounts can do this.", { status: 403 });
    const all = readConsents();
    let reset = 0;
    for (const id of DEMO_IDS) {
      if (all[id]) {
        delete all[id];
        reset += 1;
      }
    }
    writeConsents(all);
    return { reset };
  }],

  // Complaints live in their own store: services/consentService.js anonymises them.
  ["DELETE", /^\/me\/data$/, (db, _m, body) => {
    const user = requireRole(...ROLES);
    validateDataDeletion(body);
    if (user.method === LOGIN_METHOD.DEMO) throw new ApiError("The shared demo accounts can't be deleted.", { status: 403 });
    const before = (db.ratings ?? []).length;
    db.ratings = (db.ratings ?? []).filter((r) => r.userId !== user.id);
    save(db);
    const consents = readConsents();
    const hadConsent = Boolean(consents[user.id]);
    delete consents[user.id];
    writeConsents(consents);
    return { deleted: { account: 1, ratings: before - db.ratings.length, consent: hadConsent ? 1 : 0, photos: 0 }, anonymised: {} };
  }],

  ["GET", /^\/toilets\/ratings\/summary$/, (db, _m, _b, query) => {
    const ids = (query.get("ids") ?? "").split(",").filter(Boolean);
    if (!ids.length || ids.length > 100) throw new ValidationError({ ids: "Send 1 to 100 toilet ids, comma-separated." });
    return { items: [...new Set(ids)].map((id) => ratingSummary(db, id)).filter((s) => s.count > 0) };
  }],

  ["GET", /^\/toilets\/ratings\/low$/, (db, _m, _b, query) => {
    requireRole(...ADMIN_ROLES);
    const paging = parsePage(queryObject(query));
    const low = db.locations
      .filter((l) => l.type === "public_toilet" && !l.deletedAt)
      .map((l) => ({ toiletId: l.id, name: l.name, ...ratingSummary(db, l.id) }))
      .filter(isLowRated)
      .sort((a, b) => a.average - b.average || a.toiletId.localeCompare(b.toiletId))
      .map(({ toiletId, name, average, count }) => ({ toiletId, name, average, count }));
    return pageOf(paging, low.length, low.slice(paging.skip, paging.skip + paging.limit));
  }],

  ["PUT", /^\/toilets\/([^/]+)\/rating$/, (db, [id], body) => {
    const user = requireRole("citizen");
    const rating = validateRating(body);
    liveToilet(db, id);
    db.ratings ??= [];
    const ts = now();
    const existing = db.ratings.find((r) => r.toiletId === id && r.userId === user.id);
    const doc = existing ?? { toiletId: id, userId: user.id, createdAt: ts };
    Object.assign(doc, { stars: rating.stars, categories: rating.categories, comment: rating.comment, updatedAt: ts });
    if (!existing) db.ratings.push(doc);
    save(db);
    return { rating: ratingDto(doc), summary: ratingSummary(db, id) };
  }],

  ["GET", /^\/toilets\/([^/]+)\/rating\/me$/, (db, [id]) => {
    const user = requireRole(...ROLES);
    return { rating: ratingDto(ratingsOf(db, id).find((r) => r.userId === user.id)) };
  }],

  ["GET", /^\/toilets\/([^/]+)\/ratings$/, (db, [id], _b, query) => {
    liveToilet(db, id);
    const paging = parsePage(queryObject(query));
    // Newest first; for the same moment, the one saved last first (the API breaks ties by _id).
    const all = ratingsOf(db, id)
      .map((r, i) => [r, i])
      .sort(([a, i], [b, j]) => newestFirst(a, b) || j - i)
      .map(([r]) => r);
    const items = all
      .slice(paging.skip, paging.skip + paging.limit)
      .map((r) => ({ stars: r.stars, categories: r.categories ?? {}, comment: r.comment ?? "", updatedAt: r.updatedAt }));
    return pageOf(paging, all.length, items);
  }],

  ["GET", /^\/toilets\/([^/]+)\/ratings\/summary$/, (db, [id]) => {
    liveToilet(db, id);
    return ratingSummary(db, id);
  }],

  ["GET", /^\/geo\/search$/, async (_db, _m, _b, query) => {
    requireRole(...ROLES);
    const q = (query.get("q") ?? "").trim().replace(/\s+/g, " ");
    if (q.length < 2 || q.length > 100) throw new ValidationError({ q: "Type 2 to 100 characters to search." });
    const rows = await nominatim("/search", { q, countrycodes: "in", limit: 5 });
    return {
      results: (Array.isArray(rows) ? rows : [])
        .map((r) => ({ label: String(r.display_name ?? ""), latitude: Number(r.lat), longitude: Number(r.lon), wide: WIDE_TYPES.has(r.addresstype ?? r.type) }))
        .filter((r) => r.label && Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
        .slice(0, 5),
    };
  }],

  ["GET", /^\/geo\/reverse$/, async (_db, _m, _b, query) => {
    requireRole(...ROLES);
    const lat = Number(query.get("lat"));
    const lon = Number(query.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new ValidationError({ lat: "Unknown position." });
    }
    const row = await nominatim("/reverse", { lat, lon, zoom: 18 });
    return { address: typeof row?.display_name === "string" ? row.display_name : null };
  }],

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

/**
 * Every service calls this. With VITE_USE_API=true it calls the EcoSetu API as
 * the signed-in user (services/session.js: token, refresh, retries); otherwise
 * the in-browser stand-in below answers the same paths. Either way it resolves
 * with the response body or rejects with an error carrying status, message
 * and per-field errors.
 */
export async function api(path, options = {}) {
  if (apiEnabled()) return getSessionClient().request(`/api${path}`, options);
  return localApi(path, options);
}

/**
 * Walks every page of a paged list (pages of 100, at most 50 pages). With
 * `conditional`, each page is a conditional request; if no page changed, the
 * previous result array itself is returned, so callers can tell nothing did.
 */
const lastAll = new Map();
export async function apiAll(path, key, { conditional = false } = {}) {
  const pages = [];
  for (let page = 1; page <= 50; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await api(`${path}${sep}page=${page}&limit=100`, { conditional });
    pages.push(res);
    if (!res.hasMore) break;
  }
  const previous = lastAll.get(path);
  if (conditional && previous && previous.pages.length === pages.length && previous.pages.every((p, i) => p === pages[i])) {
    return previous.items;
  }
  const items = pages.flatMap((p) => p[key] ?? []);
  if (conditional) lastAll.set(path, { pages, items });
  return items;
}

async function localApi(path, { method = "GET", body } = {}) {
  const [pathname, search = ""] = path.split("?");
  for (const [verb, pattern, handler] of routes) {
    if (verb !== method) continue;
    const match = pattern.exec(pathname);
    if (!match) continue;
    try {
      return await handler(load(), match.slice(1).map(decodeURIComponent), body, new URLSearchParams(search));
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new ApiError("Please fix the highlighted fields.", { status: 400, fields: err.errors });
      }
      throw err;
    }
  }
  throw new ApiError("Not found.", { status: 404 });
}
