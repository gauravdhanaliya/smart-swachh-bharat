export const ROLES = ["citizen", "worker", "supervisor", "official", "superadmin"];

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

export const FILL_THRESHOLDS = { ALMOST_FULL: 71, OVERFLOW: 91 };
export function statusFromFillLevel(fill) {
  if (fill >= FILL_THRESHOLDS.OVERFLOW) return "overflow";
  if (fill >= FILL_THRESHOLDS.ALMOST_FULL) return "almost_full";
  return "normal";
}
