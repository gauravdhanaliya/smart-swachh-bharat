// Validation for complaints, votes, ratings, consent and data deletion.
// Every body is a plain object with only the listed fields; text is trimmed
// and length-checked (over-long text is an error, not silently cut); nothing
// the server decides (ids, owners, status, priority) can be sent.

import {
  COMPLAINT_STATUS,
  FACILITY_CATEGORIES,
  FACILITY_ISSUE_TYPE,
  GENERAL_ISSUE_TYPES,
  WORKER_ID_PATTERN,
} from "./constants.js";
import { CONSENT_ITEMS, RATING_CATEGORIES } from "./schemas.js";
import { ValidationError, onlyFields, parseCoordinates, photo, rejectUnknown, text } from "./validate.js";
import { maskPhone, normalisePhone } from "./phone.js";

const isPlainObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const fail = (errors) => {
  if (Object.keys(errors).length) throw new ValidationError(errors);
};

export const FACILITY_ID_PATTERN = /^(DB|PT)-[A-Za-z0-9-]{1,28}$/;
const COMPLAINT_FIELDS = ["issueType", "description", "location", "photo", "facilityType", "facilityId", "category"];

/**
 * POST /api/complaints. Two shapes:
 *   general:  { issueType, description, location: { address, latitude, longitude }, photo? }
 *   facility: { facilityType: "bin"|"toilet", facilityId, category, description?, photo? }
 *             — the location comes from the facility, so none may be sent;
 *               "Other" needs a description.
 * Returns the cleaned fields plus `priority`, which the server derives.
 */
export function validateComplaint(body) {
  if (!isPlainObject(body)) throw new ValidationError({ body: "A JSON object is required." });
  const errors = rejectUnknown(body, COMPLAINT_FIELDS, {});
  const isFacility = body.facilityType !== undefined || body.facilityId !== undefined || body.category !== undefined;
  const description = text(body, "description", 500, errors, { label: "Description" });
  const complaintPhoto = photo(body.photo, "photo", errors);

  if (isFacility) {
    const facilityType = body.facilityType;
    const categories = FACILITY_CATEGORIES[facilityType];
    if (typeof facilityType !== "string" || !categories) errors.facilityType = 'Facility type must be "bin" or "toilet".';
    if (typeof body.facilityId !== "string" || !FACILITY_ID_PATTERN.test(body.facilityId)) errors.facilityId = "Choose the bin or toilet to report.";
    const category = body.category;
    if (categories && !(typeof category === "string" && Object.hasOwn(categories, category))) {
      errors.category = `Category must be one of: ${Object.keys(categories).join(", ")}.`;
    }
    if (body.location !== undefined) errors.location = "The location is taken from the facility.";
    if (body.issueType !== undefined) errors.issueType = "The issue type is set from the facility.";
    if (category === "Other" && !description && !errors.description) errors.description = 'Please describe the problem when choosing "Other".';
    fail(errors);
    return {
      facilityType,
      facilityId: body.facilityId,
      category,
      issueType: FACILITY_ISSUE_TYPE[facilityType],
      priority: categories[category],
      description,
      photo: complaintPhoto,
    };
  }

  const issueType = body.issueType;
  if (!(typeof issueType === "string" && Object.hasOwn(GENERAL_ISSUE_TYPES, issueType))) {
    errors.issueType = `Issue type must be one of: ${Object.keys(GENERAL_ISSUE_TYPES).join(", ")}.`;
  }
  if (!description && !errors.description) errors.description = "Description is required.";
  let location = null;
  if (!isPlainObject(body.location)) {
    errors.location = "A location is required.";
  } else {
    rejectUnknown(body.location, ["address", "latitude", "longitude"], errors);
    const { latitude, longitude } = parseCoordinates(body.location, errors);
    const address = text(body.location, "address", 200, errors, { required: true, label: "Address" });
    location = { address, latitude, longitude };
  }
  fail(errors);
  return {
    facilityType: null,
    facilityId: null,
    category: null,
    issueType,
    priority: GENERAL_ISSUE_TYPES[issueType],
    description,
    location,
    photo: complaintPhoto,
  };
}

/** PATCH /api/complaints/:id/status — a worker moving their own job along. */
export function validateStatusChange(input) {
  const body = onlyFields(input, ["status", "resolutionNote", "resolutionPhoto"]);
  const errors = {};
  const statuses = Object.values(COMPLAINT_STATUS);
  if (!statuses.includes(body.status)) errors.status = `Status must be one of: ${statuses.join(", ")}.`;
  const resolving = body.status === COMPLAINT_STATUS.RESOLVED;
  let resolutionNote = "";
  let resolutionPhoto = null;
  if (resolving) {
    resolutionNote = text(body, "resolutionNote", 300, errors, { required: true, label: "A resolution note" });
    if (resolutionNote && resolutionNote.length < 5) errors.resolutionNote = "The resolution note needs at least 5 characters.";
    resolutionPhoto = photo(body.resolutionPhoto, "resolutionPhoto", errors);
  } else {
    if (body.resolutionNote !== undefined) errors.resolutionNote = "Only sent when resolving.";
    if (body.resolutionPhoto !== undefined) errors.resolutionPhoto = "Only sent when resolving.";
  }
  fail(errors);
  return { status: body.status, resolutionNote, resolutionPhoto };
}

/** POST /api/complaints/:id/assign */
export function validateAssign(input) {
  const body = onlyFields(input, ["workerId"]);
  if (typeof body.workerId !== "string" || !WORKER_ID_PATTERN.test(body.workerId)) {
    throw new ValidationError({ workerId: "Choose a worker." });
  }
  return body.workerId;
}

/** PATCH /api/complaints/:id/priority */
export function validatePriority(input) {
  const body = onlyFields(input, ["priority"]);
  if (!["HIGH", "MEDIUM", "LOW"].includes(body.priority)) throw new ValidationError({ priority: "Priority must be HIGH, MEDIUM or LOW." });
  return body.priority;
}

/** POST /api/complaints/:id/vote — { direction: "up" | "down" | null } (null clears it). */
export function validateVote(input) {
  const body = onlyFields(input, ["direction"]);
  if (!("direction" in body) || ![null, "up", "down"].includes(body.direction)) {
    throw new ValidationError({ direction: 'Direction must be "up", "down" or null.' });
  }
  return body.direction;
}

/** PUT /api/toilets/:id/rating — { stars, categories?, comment? }. */
export function validateRating(body) {
  if (!isPlainObject(body)) throw new ValidationError({ body: "A JSON object is required." });
  const errors = rejectUnknown(body, ["stars", "categories", "comment"], {});
  const whole1to5 = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
  if (!whole1to5(body.stars)) errors.stars = "Stars must be a whole number from 1 to 5.";
  const categories = {};
  if (body.categories !== undefined) {
    if (!isPlainObject(body.categories)) {
      errors.categories = "Categories must be an object.";
    } else {
      for (const [key, value] of Object.entries(body.categories)) {
        if (!RATING_CATEGORIES.includes(key)) errors.categories = `Unknown category "${key}".`;
        else if (!whole1to5(value)) errors.categories = `${key} must be a whole number from 1 to 5.`;
        else categories[key] = value;
      }
    }
  }
  const comment = text(body, "comment", 300, errors, { label: "Comment" });
  fail(errors);
  return { stars: body.stars, categories, comment };
}

/**
 * PUT /api/me/consent — { version, items: { phoneForLogin, locationWhenReporting,
 * photosAttached, readNotice } }, every item a boolean. The notice, location
 * and photo items must be accepted; the phone item too for phone-login users.
 * The version is checked by the route (a stale one is a 409, not a 400).
 */
export function validateConsent(input, { phoneUser }) {
  const body = onlyFields(input, ["version", "items"]);
  const errors = {};
  if (!Number.isInteger(body.version) || body.version < 0) errors.version = "Version must be a whole number.";
  if (!isPlainObject(body.items)) {
    errors.items = "Items are required.";
    fail(errors);
  }
  rejectUnknown(body.items, CONSENT_ITEMS, errors);
  for (const key of CONSENT_ITEMS) {
    if (typeof body.items[key] !== "boolean") errors[key] = "Must be true or false.";
  }
  const required = ["readNotice", "locationWhenReporting", "photosAttached", ...(phoneUser ? ["phoneForLogin"] : [])];
  for (const key of required) {
    if (body.items[key] === false) errors[key] = "This box must be ticked to continue.";
  }
  fail(errors);
  return { version: body.version, items: Object.fromEntries(CONSENT_ITEMS.map((k) => [k, body.items[k]])) };
}

/** DELETE /api/me/data — needs { confirm: true }, so it can't happen by accident. */
export function validateDataDeletion(input) {
  const body = onlyFields(input, ["confirm"]);
  if (body.confirm !== true) throw new ValidationError({ confirm: "Send { confirm: true } to delete your data." });
}

/**
 * PATCH /api/profile. Everyone may change their display name; officials also
 * their state, district and ministry. Returns only the fields sent.
 */
export function validateProfile(input, { gov }) {
  const allowed = gov ? ["name", "state", "district", "ministry"] : ["name"];
  const body = onlyFields(input, allowed);
  const errors = {};
  const out = {};
  const limits = { name: 80, state: 60, district: 80, ministry: 120 };
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    out[key] = text(body, key, limits[key], errors, { required: true, label: key[0].toUpperCase() + key.slice(1) });
  }
  fail(errors);
  return out;
}

const WORKER_STATUSES = ["Available", "On Duty"];

/** POST /api/workers: { name, area, role?, phone?, status? }. A phone number is kept only masked. */
export function validateWorker(input) {
  const body = onlyFields(input, ["name", "area", "role", "phone", "status"]);
  const errors = {};
  const name = text(body, "name", 80, errors, { required: true, label: "Name" });
  const area = text(body, "area", 120, errors, { required: true, label: "Area" });
  const role = text(body, "role", 60, errors, { label: "Role" }) || "Sanitation Worker";
  const status = body.status ?? "Available";
  if (!WORKER_STATUSES.includes(status)) errors.status = "Status must be Available or On Duty.";
  let phoneMasked = null;
  if (body.phone !== undefined && body.phone !== "") {
    const digits = typeof body.phone === "string" ? normalisePhone(body.phone) : null;
    if (!digits) errors.phone = "Enter a valid 10 digit mobile number.";
    else phoneMasked = maskPhone(digits);
  }
  fail(errors);
  return { name, area, role, status, phoneMasked };
}
