// Step 14A — Worker "Request Facility" constants. The requests themselves
// live in the EcoSetu API (see services/facilityRequestService.js); none
// ship with the app.

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

export const FACILITY_REQUEST_ID_PREFIX = `FR-${new Date().getFullYear()}-`;

// Where maps open before a place is known: the centre of India. Screens
// centre on the signed-in user's profile city instead whenever there is one.
export const INDIA_CENTER = { latitude: 22.9734, longitude: 78.6569 };

function isoNow() {
  return new Date().toISOString();
}

export { isoNow };
