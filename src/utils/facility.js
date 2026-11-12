// Labels and filters for complaints linked to a bin or toilet (Feature 4).

export const FACILITY_TYPE_LABEL = { bin: "Dustbin", toilet: "Public toilet" };

/** "Toilet PT-001 · No water" for a facility complaint; null for a general one. */
export function facilityLabel(complaint) {
  if (!complaint?.facilityId) return null;
  const kind = complaint.facilityType === "toilet" ? "Toilet" : "Bin";
  return `${kind} ${complaint.facilityId}${complaint.category ? ` · ${complaint.category}` : ""}`;
}

export const FACILITY_FILTERS = [
  { value: "all", label: "All" },
  { value: "bin", label: "Bins" },
  { value: "toilet", label: "Toilets" },
  { value: "none", label: "Not linked to a facility" },
];

export function matchesFacilityFilter(complaint, filter) {
  if (filter === "all") return true;
  if (filter === "none") return !complaint.facilityId;
  return complaint.facilityType === filter;
}
