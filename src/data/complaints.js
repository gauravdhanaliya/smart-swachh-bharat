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

export const DESCRIPTION_MAX_LENGTH = 500;
export const MAX_PHOTO_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Step 6 — Worker "Mark as Resolved" completion photo. Kept as its own
// constant (rather than reusing MAX_PHOTO_SIZE_BYTES) because the field
// spec for the worker upload calls out a 5 MB ceiling specifically.
export const MAX_RESOLUTION_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const RESOLUTION_NOTE_MAX_LENGTH = 300;
export const RESOLUTION_NOTE_MIN_LENGTH = 5;

export const COMPLAINT_ID_PREFIX = `SSB${new Date().getFullYear()}-`;

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
