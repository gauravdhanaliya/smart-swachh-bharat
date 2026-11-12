// Input validation + sanitisation. Everything coming from a request body
// passes through here before it touches the database.

import {
  LOCATION_TYPES,
  STATUS_BY_TYPE,
  statusGroup,
  normalizeBinStatus,
  REQUEST_FACILITY_TYPES,
  REQUEST_PRIORITIES,
} from "./constants.js";

export class ValidationError extends Error {
  constructor(errors) {
    super("Validation failed");
    this.errors = errors;
  }
}

// Strip control characters and angle brackets; collapse whitespace.
export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const isPlainObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Adds "Not allowed." to `errors` for every key of `body` outside `allowed`. */
export function rejectUnknown(body, allowed, errors) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) errors[key] = "Not allowed.";
  }
  return errors;
}

/** Throws unless `body` is a JSON object with only `allowed` keys. Returns the body. */
export function onlyFields(body, allowed) {
  if (body === undefined || body === null) body = {};
  if (!isPlainObject(body)) throw new ValidationError({ body: "A JSON object is required." });
  const errors = rejectUnknown(body, allowed, {});
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return body;
}

/**
 * Text that must be a string (or absent), trimmed, at most `max` characters.
 * Over-long text is an error rather than silently cut.
 */
export function text(body, field, max, errors, { required = false, label = field } = {}) {
  const raw = body[field];
  if (raw === undefined || raw === null) {
    if (required) errors[field] = `${label} is required.`;
    return "";
  }
  if (typeof raw !== "string") {
    errors[field] = `${label} must be text.`;
    return "";
  }
  const value = cleanText(raw, max + 1);
  if (value.length > max) errors[field] = `${label} can be at most ${max} characters.`;
  else if (required && !value) errors[field] = `${label} is required.`;
  return value.slice(0, max);
}

// ---- pagination ------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** ?page=&limit= -> { page, limit, skip }. Defaults 1 and 20; limit at most 100. */
export function parsePage(query = {}) {
  const errors = {};
  const int = (name, fallback, min, max) => {
    const raw = query[name];
    if (raw === undefined || raw === "") return fallback;
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
      errors[name] = `${name} must be a whole number.`;
      return fallback;
    }
    const n = Number(raw);
    if (n < min || n > max) errors[name] = `${name} must be between ${min} and ${max}.`;
    return n;
  };
  const page = int("page", 1, 1, 100_000);
  const limit = int("limit", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { page, limit, skip: (page - 1) * limit };
}

/** The response envelope every list uses. */
export function pageOf({ page, limit }, total, items, key = "items") {
  return { [key]: items, page, limit, total, hasMore: page * limit < total };
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

export function parseCoordinates(body, errors) {
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.latitude = "Latitude must be a number between -90 and 90.";
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.longitude = "Longitude must be a number between -180 and 180.";
  }
  return { latitude, longitude };
}

const FACILITY_OPTIONS = ["Men", "Women", "Accessible"];
const WASTE_TYPES = ["Dry Waste", "Wet Waste", "Mixed Waste"];

function cleanDetails(type, raw) {
  const group = statusGroup(type);
  const d = raw && typeof raw === "object" ? raw : {};
  if (group === "dustbin") {
    // Bins carry a status, not a fill percentage: a `fillLevel` sent by an
    // old client (or left on an old record) is dropped, never stored.
    const wasteType = WASTE_TYPES.includes(d.wasteType) ? d.wasteType : "Mixed Waste";
    return { wasteType };
  }
  if (group === "public_toilet") {
    const facilities = Array.isArray(d.facilities)
      ? d.facilities.filter((f) => FACILITY_OPTIONS.includes(f))
      : ["Men", "Women"];
    let cleanliness = d.cleanliness === undefined ? 4 : toNumber(d.cleanliness);
    if (!Number.isFinite(cleanliness) || cleanliness < 1 || cleanliness > 5) cleanliness = 4;
    return {
      openingHours: cleanText(d.openingHours ?? "6:00 AM – 10:00 PM", 60) || "6:00 AM – 10:00 PM",
      cleanliness: Math.round(cleanliness),
      facilities: facilities.length ? facilities : ["Men", "Women"],
    };
  }
  return {};
}

/**
 * Validates a create (full) or update (partial) location payload.
 * `existing` is the stored row when updating, so unchanged fields keep
 * their value and a type can't silently change across status groups.
 */
export const LOCATION_FIELDS = ["name", "type", "latitude", "longitude", "description", "address", "status", "details"];

export function validateLocation(body, { existing = null } = {}) {
  const errors = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError({ body: "A JSON object is required." });
  }
  rejectUnknown(body, LOCATION_FIELDS, errors);
  const merged = existing
    ? {
        name: existing.name,
        type: existing.type,
        latitude: existing.latitude,
        longitude: existing.longitude,
        description: existing.description,
        address: existing.address,
        status: existing.status,
        ...body,
      }
    : body;

  const name = cleanText(merged.name, 120);
  if (!name) errors.name = "Name is required.";

  const type = merged.type;
  if (!LOCATION_TYPES.includes(type)) {
    errors.type = `Type must be one of: ${LOCATION_TYPES.join(", ")}.`;
  } else if (type === "campus") {
    errors.type = "The campus reference location cannot be created or edited here.";
  } else if (existing && statusGroup(existing.type) !== statusGroup(type)) {
    errors.type = "A location's type can't be changed between facility and building groups.";
  }

  const { latitude, longitude } = parseCoordinates(merged, errors);

  const group = LOCATION_TYPES.includes(type) ? statusGroup(type) : "building";
  const rawDetails = existing ? { ...existing.details, ...(body.details ?? {}) } : merged.details;
  const details = cleanDetails(type, rawDetails);

  let status = merged.status;
  // An old bin record with no usable status gets one from its legacy
  // percentage. A status in the request is always validated as sent.
  const statusSent = !(body.status === undefined || body.status === null || body.status === "");
  if (group === "dustbin" && existing && !statusSent) {
    status = normalizeBinStatus(existing);
  }
  if (status === undefined || status === null || status === "") {
    status = STATUS_BY_TYPE[group][0];
  }
  if (!STATUS_BY_TYPE[group].includes(status)) {
    errors.status = `Status must be one of: ${STATUS_BY_TYPE[group].join(", ")}.`;
  }

  const description = cleanText(merged.description ?? "", 300);
  const address = cleanText(merged.address ?? "", 200);

  if (Object.keys(errors).length) throw new ValidationError(errors);
  const result = { name, type, latitude, longitude, description, address, status, details };
  // A bin whose status a person has set is "manual" and the demo simulation
  // never changes it again; otherwise it stays whatever it was ("simulated"
  // for a new bin).
  if (group === "dustbin") {
    result.statusSource = statusSent ? "manual" : (existing?.statusSource ?? "simulated");
  }
  return result;
}

// The web client compresses every photo to under 1 MB before sending it.
export const MAX_PHOTO_BYTES = 1_000_000;

/** Decoded size of a base64 data URL, in bytes. */
export function photoBytes(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

const PHOTO_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** An optional photo: a JPEG/PNG/WebP data URL of at most 1 MB, or null. */
export function photo(value, field, errors) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !PHOTO_PATTERN.test(value) || photoBytes(value) > MAX_PHOTO_BYTES) {
    errors[field] = "Photo must be a JPEG, PNG or WebP image under 1 MB.";
    return null;
  }
  return value;
}

const REQUEST_FIELDS = [
  "facilityType",
  "suggestedName",
  "location",
  "reason",
  "description",
  "priority",
  "photo",
  "requestedByWorkerId",
  "requestedByWorkerName",
];

export function validateRequest(body) {
  const errors = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError({ body: "A JSON object is required." });
  }
  rejectUnknown(body, REQUEST_FIELDS, errors);
  if (isPlainObject(body.location)) rejectUnknown(body.location, ["address", "latitude", "longitude"], errors);
  const facilityType = body.facilityType;
  if (!Object.keys(REQUEST_FACILITY_TYPES).includes(facilityType)) {
    errors.facilityType = 'Facility type must be "Dustbin" or "Public Toilet".';
  }
  const suggestedName = cleanText(body.suggestedName, 120);
  if (!suggestedName) errors.suggestedName = "A suggested name is required.";

  const loc = body.location && typeof body.location === "object" ? body.location : {};
  const { latitude, longitude } = parseCoordinates(loc, errors);
  const address = cleanText(loc.address ?? "", 200);
  if (!address) errors.address = "An address or landmark is required.";

  const reason = cleanText(body.reason, 300);
  if (reason.length < 5) errors.reason = "Please give a reason (at least 5 characters).";
  const description = cleanText(body.description ?? "", 500);

  const priority = body.priority ?? "MEDIUM";
  if (!REQUEST_PRIORITIES.includes(priority)) errors.priority = "Invalid priority.";

  const requestPhoto = photo(body.photo, "photo", errors);

  const workerId = typeof body.requestedByWorkerId === "string" ? body.requestedByWorkerId : "";
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(workerId)) errors.requestedByWorkerId = "Invalid worker id.";
  const workerName = cleanText(body.requestedByWorkerName ?? "", 80);

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    facilityType,
    suggestedName,
    address,
    latitude,
    longitude,
    reason,
    description,
    priority,
    photo: requestPhoto,
    requestedByWorkerId: workerId,
    requestedByWorkerName: workerName,
  };
}

// Which seeded demo user each demo-login choice means ("government" is the
// app's name for the official role). Kept here, not taken from the client.
export const DEMO_LOGIN_UIDS = {
  citizen: "demo-citizen",
  worker: "demo-worker",
  official: "demo-official",
  government: "demo-official",
};

/**
 * Body of POST /api/auth/demo: exactly { role } and nothing else. The client
 * picks one of the three seeded demo users; it can't name a uid, a display
 * name, a worker id or anything else. Returns the demo user's uid.
 */
export function validateDemoLogin(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError({ body: "A JSON object is required." });
  }
  const extra = Object.keys(body).filter((k) => k !== "role");
  if (extra.length) {
    throw new ValidationError(Object.fromEntries(extra.map((k) => [k, "Not allowed."])));
  }
  const uid = typeof body.role === "string" && Object.hasOwn(DEMO_LOGIN_UIDS, body.role) ? DEMO_LOGIN_UIDS[body.role] : null;
  if (!uid) throw new ValidationError({ role: "Role must be citizen, worker or official." });
  return uid;
}

/**
 * Body of POST /api/auth/firebase (alias: /api/auth/firebase-login): the
 * Firebase ID token and an optional display name. Anything else (a `role`,
 * `workerId`…) is refused — roles come from the database alone.
 */
export function validateFirebaseLogin(body) {
  const errors = {};
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  rejectUnknown(b, ["idToken", "name"], errors);

  const idToken = typeof b.idToken === "string" ? b.idToken.trim() : "";
  if (!idToken || idToken.length > 4096) errors.idToken = "A Firebase ID token is required.";

  if (b.name !== undefined && b.name !== null && typeof b.name !== "string") errors.name = "Name must be text.";

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { idToken, name: cleanText(b.name ?? "", 80) };
}
