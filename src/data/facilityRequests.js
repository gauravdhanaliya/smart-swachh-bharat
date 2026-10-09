// Step 14A — Worker "Request Facility" constants. The requests themselves
// live in the EcoSetu API (see services/facilityRequestService.js); demo
// requests are seeded on the server.

export const FACILITY_TYPE = {
  DUSTBIN: "Dustbin",
  TOILET: "Public Toilet",
};

export const FACILITY_TYPES = [
  { id: FACILITY_TYPE.DUSTBIN, label: "Dustbin", icon: "🗑️" },
  { id: FACILITY_TYPE.TOILET, label: "Public Toilet", icon: "🚻" },
];

export const REQUEST_STATUS = {
  PENDING: "PENDING",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

export const REQUEST_STATUS_LABELS = {
  [REQUEST_STATUS.PENDING]: "Pending",
  [REQUEST_STATUS.UNDER_REVIEW]: "Under Review",
  [REQUEST_STATUS.APPROVED]: "Approved",
  [REQUEST_STATUS.REJECTED]: "Rejected",
};

export const FACILITY_PRIORITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

export const FACILITY_PRIORITIES = [
  FACILITY_PRIORITY.LOW,
  FACILITY_PRIORITY.MEDIUM,
  FACILITY_PRIORITY.HIGH,
  FACILITY_PRIORITY.CRITICAL,
];

export const REASON_MAX_LENGTH = 300;
export const DESCRIPTION_MAX_LENGTH = 500;
export const MAX_PHOTO_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const YEAR = 2026;
export const FACILITY_REQUEST_ID_PREFIX = `FR-${YEAR}-`;

// Reference points a worker can pick without a click-to-drop-pin map.
// Only the first is verified (OpenStreetMap, ODbL); workers can also drop a
// pin on the map or type coordinates.
export const CAMPUS_CENTER = { latitude: 29.8905551, longitude: 77.9601633 };
export const FACILITY_PICK_LOCATIONS = [
  { address: "COER University — campus centre (map reference)", ...CAMPUS_CENTER },
  { address: "COER University — OpenStreetMap campus centroid", latitude: 29.8905429, longitude: 77.9594553 },
];

function isoNow() {
  return new Date().toISOString();
}

export { isoNow };
