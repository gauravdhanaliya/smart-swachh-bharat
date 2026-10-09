// Input validation + sanitisation. Everything coming from a request body
// passes through here before it touches the database.

import {
  LOCATION_TYPES,
  STATUS_BY_TYPE,
  statusGroup,
  statusFromFillLevel,
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

function cleanDetails(type, raw, errors) {
  const group = statusGroup(type);
  const d = raw && typeof raw === "object" ? raw : {};
  if (group === "dustbin") {
    const wasteType = WASTE_TYPES.includes(d.wasteType) ? d.wasteType : "Mixed Waste";
    let fillLevel = d.fillLevel === undefined ? 0 : toNumber(d.fillLevel);
    if (!Number.isFinite(fillLevel) || fillLevel < 0 || fillLevel > 100) {
      errors.fillLevel = "Fill level must be between 0 and 100.";
      fillLevel = 0;
    }
    return { wasteType, fillLevel: Math.round(fillLevel) };
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
export function validateLocation(body, { existing = null } = {}) {
  const errors = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError({ body: "A JSON object is required." });
  }
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
  const details = cleanDetails(type, rawDetails, errors);

  let status = merged.status;
  // A bin's status follows its fill level unless a status was given.
  if (group === "dustbin" && body.status === undefined && details.fillLevel !== undefined) {
    status = statusFromFillLevel(details.fillLevel);
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
  return { name, type, latitude, longitude, description, address, status, details };
}

export function validateRequest(body) {
  const errors = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError({ body: "A JSON object is required." });
  }
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

  let photo = null;
  if (body.photo) {
    if (
      typeof body.photo !== "string" ||
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo) ||
      body.photo.length > 5 * 1024 * 1024
    ) {
      errors.photo = "Photo must be a JPEG, PNG or WebP image under about 3 MB.";
    } else {
      photo = body.photo;
    }
  }

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
    photo,
    requestedByWorkerId: workerId,
    requestedByWorkerName: workerName,
  };
}
