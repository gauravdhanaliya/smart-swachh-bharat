// Shared complaint data model for the Step 3 end-to-end workflow.
// Shape mirrors what a future `GET /api/complaints` response would return,
// so `complaintService.js` can later swap localStorage for a real API
// without touching any UI code.

export const STATUS = {
  SUBMITTED: "SUBMITTED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
};

// Ordered index used to derive the citizen-facing timeline and to
// compare "how far along" a complaint is.
export const STATUS_ORDER = [
  STATUS.SUBMITTED,
  STATUS.ASSIGNED,
  STATUS.IN_PROGRESS,
  STATUS.RESOLVED,
];

export const STATUS_LABELS = {
  [STATUS.SUBMITTED]: "Submitted",
  [STATUS.ASSIGNED]: "Assigned",
  [STATUS.IN_PROGRESS]: "In Progress",
  [STATUS.RESOLVED]: "Resolved",
};

export const PRIORITY = { HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" };

export const COMPLAINT_TYPES = [
  { id: "overflowing_bin", label: "Overflowing Bin", icon: "🗑️", priority: PRIORITY.HIGH },
  { id: "not_collected", label: "Not Collected", icon: "🚛", priority: PRIORITY.MEDIUM },
  { id: "wrong_waste", label: "Wrong Waste in Bin", icon: "♻️", priority: PRIORITY.LOW },
  { id: "damaged_bin", label: "Damaged Bin", icon: "🧰", priority: PRIORITY.MEDIUM },
  { id: "dirty_area", label: "Dirty Area", icon: "🧹", priority: PRIORITY.MEDIUM },
  { id: "public_toilet", label: "Public Toilet Issue", icon: "🚻", priority: PRIORITY.HIGH },
];

export function priorityForIssueType(issueType) {
  return COMPLAINT_TYPES.find((t) => t.label === issueType)?.priority ?? PRIORITY.MEDIUM;
}

// Demo sanitation workers a Government Official can assign a complaint to.
// Full worker profiles (area, status, etc.) live in `./workers`; this
// re-export keeps the existing assignment code untouched.
export { WORKERS } from "./workers";

// Preset localities so the citizen can pick a location without needing
// real device geolocation permissions during the demo.
export const DEMO_LOCATIONS = [
  { address: "Gomti Nagar, Lucknow", latitude: 26.8467, longitude: 80.9462 },
  { address: "Hazratganj, Lucknow", latitude: 26.8508, longitude: 80.9462 },
  { address: "Indira Nagar, Lucknow", latitude: 26.8763, longitude: 80.9944 },
  { address: "Aliganj, Lucknow", latitude: 26.8912, longitude: 80.9219 },
  { address: "Vibhuti Khand, Lucknow", latitude: 26.8558, longitude: 81.0072 },
  { address: "Alambagh, Lucknow", latitude: 26.8156, longitude: 80.9096 },
];

// Single demo citizen identity (Step 1/2 auth is OTP-only and doesn't
// collect a name yet), matching the reference-design profile screen.
export const DEMO_CITIZEN_NAME = "Rahul Sharma";

export const DESCRIPTION_MAX_LENGTH = 500;
export const MAX_PHOTO_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Step 6 — Worker "Mark as Resolved" completion photo. Kept as its own
// constant (rather than reusing MAX_PHOTO_SIZE_BYTES) because the field
// spec for the worker upload calls out a 5 MB ceiling specifically.
export const MAX_RESOLUTION_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const RESOLUTION_NOTE_MAX_LENGTH = 300;
export const RESOLUTION_NOTE_MIN_LENGTH = 5;

const YEAR = 2026;
export const COMPLAINT_ID_PREFIX = `SSB${YEAR}-`;

/**
 * Derives the 5-row citizen timeline (Submitted / Received by Government /
 * Assigned to Worker / In Progress / Resolved) from a complaint's status.
 * Returns each step tagged "done" | "current" | "pending".
 */
export function getTimelineSteps(status) {
  const index = STATUS_ORDER.indexOf(status);

  const stateFor = (currentAtIndex, isTerminal = false) => {
    if (isTerminal) return index >= currentAtIndex ? "done" : "pending";
    if (index > currentAtIndex) return "done";
    if (index === currentAtIndex) return "current";
    return "pending";
  };

  return [
    { key: "submitted", label: "Complaint Submitted", state: "done" },
    { key: "received", label: "Received by Government", state: stateFor(0) },
    { key: "assigned", label: "Assigned to Worker", state: stateFor(1) },
    { key: "in_progress", label: "In Progress", state: stateFor(2) },
    { key: "resolved", label: "Resolved", state: stateFor(3, true) },
  ];
}

function isoNow() {
  return new Date().toISOString();
}

// A few pre-existing complaints so the screens don't look empty on
// first load (per the Step 3 spec). Real submissions during the demo
// receive the next available ID after these.
export const SEED_COMPLAINTS = [
  {
    id: `${COMPLAINT_ID_PREFIX}0045`,
    citizenName: DEMO_CITIZEN_NAME,
    issueType: "Damaged Bin",
    description: "The dry-waste bin near the park entrance has a cracked lid and won't close.",
    location: { address: "Indira Nagar, Lucknow", latitude: 26.8763, longitude: 80.9944 },
    priority: PRIORITY.MEDIUM,
    photo: null,
    status: STATUS.RESOLVED,
    assignedWorkerId: "w3",
    assignedWorkerName: "Suresh Yadav",
    resolutionNote: "Bin replaced with a new one.",
    createdAt: "2026-05-20T09:15:00.000Z",
    updatedAt: "2026-05-20T15:40:00.000Z",
  },
  {
    id: `${COMPLAINT_ID_PREFIX}0046`,
    citizenName: DEMO_CITIZEN_NAME,
    issueType: "Wrong Waste in Bin",
    description: "Hazardous e-waste dumped in the recyclable-waste bin.",
    location: { address: "Gomti Nagar, Lucknow", latitude: 26.8467, longitude: 80.9462 },
    priority: PRIORITY.LOW,
    photo: null,
    status: STATUS.RESOLVED,
    assignedWorkerId: "w1",
    assignedWorkerName: "Vikash Kumar",
    resolutionNote: "Waste sorted and removed correctly.",
    createdAt: "2026-05-24T11:05:00.000Z",
    updatedAt: "2026-05-24T17:20:00.000Z",
  },
  {
    id: `${COMPLAINT_ID_PREFIX}0047`,
    citizenName: DEMO_CITIZEN_NAME,
    issueType: "Not Collected",
    description: "Garbage has not been collected from this street for 3 days.",
    location: { address: "Vibhuti Khand, Lucknow", latitude: 26.8558, longitude: 81.0072 },
    priority: PRIORITY.MEDIUM,
    photo: null,
    status: STATUS.IN_PROGRESS,
    assignedWorkerId: "w4",
    assignedWorkerName: "Mohit Singh",
    resolutionNote: "",
    createdAt: isoNow(),
    updatedAt: isoNow(),
  },
  {
    id: `${COMPLAINT_ID_PREFIX}0048`,
    citizenName: DEMO_CITIZEN_NAME,
    issueType: "Overflowing Bin",
    description: "Bin is overflowing and waste is spreading around the area.",
    location: { address: "Gomti Nagar, Lucknow", latitude: 26.8467, longitude: 80.9462 },
    priority: PRIORITY.HIGH,
    photo: null,
    status: STATUS.SUBMITTED,
    assignedWorkerId: null,
    assignedWorkerName: null,
    resolutionNote: "",
    createdAt: isoNow(),
    updatedAt: isoNow(),
  },
];
