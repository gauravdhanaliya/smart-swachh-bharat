// Step 14A — Worker "Request Facility" data model.
// Shape mirrors what a future `GET /api/facility-requests` response would
// return, so `facilityRequestService.js` can later swap localStorage for a
// real API without touching any UI code (same pattern as data/complaints.js
// + services/complaintService.js).

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

// Named locations a worker can pick from the existing map preview,
// without needing a click-to-drop-pin map library. Coordinates are
// prototype approximations for the demo, not surveyed points.
export const FACILITY_PICK_LOCATIONS = [
  { address: "Near IIMT University, Meerut", latitude: 28.9846, longitude: 77.7064 },
  { address: "Ganganagar, Lucknow", latitude: 26.8845, longitude: 80.9614 },
  { address: "Gomti Nagar, Lucknow", latitude: 26.8467, longitude: 80.9462 },
  { address: "Hazratganj, Lucknow", latitude: 26.8508, longitude: 80.9462 },
  { address: "Indira Nagar, Lucknow", latitude: 26.8763, longitude: 80.9944 },
  { address: "Aliganj, Lucknow", latitude: 26.8912, longitude: 80.9219 },
  { address: "Vibhuti Khand, Lucknow", latitude: 26.8558, longitude: 81.0072 },
  { address: "Alambagh, Lucknow", latitude: 26.8156, longitude: 80.9096 },
];

function isoNow() {
  return new Date().toISOString();
}

// Pre-seeded demo requests so "My Facility Requests" doesn't look empty
// on first load. Clearly prototype/demo data — never a real municipal
// submission. Ids match the STEP 14A spec exactly (FR-2026-001..003).
export const SEED_FACILITY_REQUESTS = [
  {
    id: `${FACILITY_REQUEST_ID_PREFIX}001`,
    facilityType: FACILITY_TYPE.DUSTBIN,
    suggestedName: "Dustbin near IIMT University gate",
    location: { address: "Near IIMT University, Meerut", latitude: 28.9846, longitude: 77.7064 },
    reason: "No dustbin within 200m of the main gate; students dump waste on the roadside.",
    description: "High footfall area during college hours. A segregated 3-bin unit would help most.",
    priority: FACILITY_PRIORITY.HIGH,
    photo: null,
    status: REQUEST_STATUS.PENDING,
    rejectionReason: "",
    requestedByWorkerId: "w1",
    requestedByWorkerName: "Vikash Kumar",
    isDemo: true,
    createdAt: "2026-06-02T09:10:00.000Z",
    updatedAt: "2026-06-02T09:10:00.000Z",
  },
  {
    id: `${FACILITY_REQUEST_ID_PREFIX}002`,
    facilityType: FACILITY_TYPE.TOILET,
    suggestedName: "Public toilet, Ganganagar market",
    location: { address: "Ganganagar, Lucknow", latitude: 26.8845, longitude: 80.9614 },
    reason: "Market area has no public toilet; nearest facility is over 1km away.",
    description: "Vendors and visitors currently have no sanitation facility nearby.",
    priority: FACILITY_PRIORITY.MEDIUM,
    photo: null,
    status: REQUEST_STATUS.APPROVED,
    rejectionReason: "",
    requestedByWorkerId: "w2",
    requestedByWorkerName: "Ramesh Kumar",
    isDemo: true,
    createdAt: "2026-05-18T11:45:00.000Z",
    updatedAt: "2026-05-27T14:20:00.000Z",
  },
  {
    id: `${FACILITY_REQUEST_ID_PREFIX}003`,
    facilityType: FACILITY_TYPE.DUSTBIN,
    suggestedName: "Extra dustbin, demo location",
    location: { address: "Demo location, Lucknow", latitude: 26.86, longitude: 80.95 },
    reason: "Sample rejected request for demo purposes.",
    description: "Prototype example showing the rejection-reason state.",
    priority: FACILITY_PRIORITY.LOW,
    photo: null,
    status: REQUEST_STATUS.REJECTED,
    rejectionReason: "A dustbin already exists within 50m of this location.",
    requestedByWorkerId: "w1",
    requestedByWorkerName: "Vikash Kumar",
    isDemo: true,
    createdAt: "2026-05-10T08:30:00.000Z",
    updatedAt: "2026-05-12T10:05:00.000Z",
  },
];

export { isoNow };
