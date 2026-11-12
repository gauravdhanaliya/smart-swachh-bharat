export const ROLES = ["citizen", "worker", "supervisor", "official", "superadmin"];

// Roles are never chosen by a client: a user is a citizen on first sign-in and
// only `npm run grant-role` (server-side, with database access) changes that.
// "government" is the name used in the admin scripts for the `official` role.
const ROLE_ALIASES = { government: "official" };
export function parseRoleName(name) {
  const key = String(name ?? "").trim().toLowerCase();
  const role = ROLE_ALIASES[key] ?? key;
  return ROLES.includes(role) ? role : null;
}

// Roles allowed to manage the official facility register.
export const ADMIN_ROLES = ["official", "superadmin"];

export const BUILDING_TYPES = [
  "academic_building",
  "department_building",
  "library",
  "admin_block",
  "hostel",
  "canteen",
  "main_gate",
];
export const FACILITY_TYPES = ["dustbin", "public_toilet"];
// "campus" is the verified reference polygon centroid, not a building.
export const LOCATION_TYPES = [...BUILDING_TYPES, ...FACILITY_TYPES, "campus"];

export const STATUS_BY_TYPE = {
  dustbin: ["normal", "almost_full", "overflow"],
  public_toilet: ["Open", "Closed", "Maintenance"],
  building: ["Open", "Closed"],
  campus: ["Open"],
};

export function statusGroup(type) {
  if (type === "dustbin") return "dustbin";
  if (type === "public_toilet") return "public_toilet";
  if (type === "campus") return "campus";
  return "building";
}

export const SOURCES = ["verified", "demo", "government", "worker_approved"];

export const REQUEST_STATUS = {
  PENDING: "PENDING",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};
export const REQUEST_FACILITY_TYPES = { Dustbin: "dustbin", "Public Toilet": "public_toilet" };
export const REQUEST_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// ---- bins: categorical status only ------------------------------------
// A bin has a status (normal / almost_full / overflow) and no fill
// percentage. The thresholds below exist only to read records saved by older
// builds, which stored `details.fillLevel` (0-100) and derived the status.

export const BIN_STATUSES = STATUS_BY_TYPE.dustbin;
const LEGACY_FILL = { ALMOST_FULL: 71, OVERFLOW: 91 };

/** The status of a bin record: its own if valid, else derived from a legacy percentage, else normal. */
export function normalizeBinStatus(record) {
  if (BIN_STATUSES.includes(record?.status)) return record.status;
  const fill = record?.details?.fillLevel;
  if (typeof fill === "number" && Number.isFinite(fill)) {
    if (fill >= LEGACY_FILL.OVERFLOW) return "overflow";
    if (fill >= LEGACY_FILL.ALMOST_FULL) return "almost_full";
  }
  return "normal";
}

/**
 * Brings an old dustbin record up to date: a valid status, and no
 * `fillLevel` / `history` in its details. Returns the same object when
 * there is nothing to change; never mutates its argument.
 */
export function migrateBinLocation(location) {
  if (location?.type !== "dustbin") return location;
  const details = location.details && typeof location.details === "object" ? location.details : null;
  const hasLegacy = details !== null && ("fillLevel" in details || "history" in details);
  const status = normalizeBinStatus(location);
  if (details !== null && !hasLegacy && status === location.status) return location;
  const { fillLevel: _fill, history: _history, ...rest } = details ?? {};
  return { ...location, status, details: rest };
}

// ---- complaints ---------------------------------------------------------

export const COMPLAINT_STATUS = {
  SUBMITTED: "SUBMITTED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
};

// The work a worker may do, by current status. Assigning is separate
// (officials, from SUBMITTED or ASSIGNED only); RESOLVED is final.
export const WORKER_TRANSITIONS = {
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
};
export const ASSIGNABLE_STATUSES = ["SUBMITTED", "ASSIGNED"];

// General reports (no facility): issue type -> priority. Same list as the app.
export const GENERAL_ISSUE_TYPES = {
  "Overflowing Bin": "HIGH",
  "Not Collected": "MEDIUM",
  "Wrong Waste in Bin": "LOW",
  "Damaged Bin": "MEDIUM",
  "Dirty Area": "MEDIUM",
  "Public Toilet Issue": "HIGH",
};

// Reports about one bin or toilet: category -> priority, per facility type.
export const FACILITY_CATEGORIES = {
  bin: {
    Overflowing: "HIGH",
    Damaged: "MEDIUM",
    "Not collected": "MEDIUM",
    "Bad smell": "MEDIUM",
    Missing: "MEDIUM",
    Other: "MEDIUM",
  },
  toilet: {
    Dirty: "HIGH",
    "No water": "HIGH",
    "Broken fixtures": "MEDIUM",
    "Locked/closed": "MEDIUM",
    "No lighting": "MEDIUM",
    "Safety concern": "HIGH",
    Other: "MEDIUM",
  },
};
export const FACILITY_LOCATION_TYPE = { bin: "dustbin", toilet: "public_toilet" };
// Toilet rating categories (each optional, 1 to 5) and the consent items.
// Shared by the API and the web app.
export const RATING_CATEGORIES = ["cleanliness", "water", "lighting", "safety", "accessibility"];
export const CONSENT_ITEMS = ["phoneForLogin", "locationWhenReporting", "photosAttached", "readNotice"];
// The privacy-notice version when ECOSETU_CONSENT_VERSION isn't set (and in
// the browser-only build). Raise it when the notice changes.
export const DEFAULT_CONSENT_VERSION = 1;

// Shown when a complaint was filed but its photo couldn't be stored.
export const PHOTO_NOT_SAVED = "Photo could not be saved, your complaint was submitted without it.";

export const FACILITY_ISSUE_TYPE = { bin: "Bin Issue", toilet: "Public Toilet Issue" };

export const WORKER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

// What a deleted user's name becomes on records kept for the municipality.
export const DELETED_USER_NAME = "Deleted user";
