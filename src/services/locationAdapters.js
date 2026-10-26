// Pure mapping between the API's `location` records and the bin / toilet /
// building shapes the screens already use. No React, no browser APIs — so
// it can be unit-tested directly (tests/locationAdapters.test.js).

export const BUILDING_TYPE_LABELS = {
  academic_building: "Academic building",
  department_building: "Department building",
  library: "Library",
  admin_block: "Administrative block",
  hostel: "Hostel",
  canteen: "Canteen",
  main_gate: "Main gate",
  campus: "Campus (verified reference)",
};

export const BUILDING_TYPE_ICONS = {
  academic_building: "🏫",
  department_building: "🏢",
  library: "📚",
  admin_block: "🏛️",
  hostel: "🛏️",
  canteen: "🍽️",
  main_gate: "🚪",
  campus: "🎓",
};

export const BUILDING_TYPES = Object.keys(BUILDING_TYPE_LABELS).filter((t) => t !== "campus");

export const isBuildingType = (type) => type in BUILDING_TYPE_LABELS;

export function relativeTime(iso, nowMs = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.floor((nowMs - t) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function deriveArea(address) {
  return address ? address.split(",")[0].trim() : "";
}

const SOURCE_LABEL = {
  demo: "DEMO · simulated location",
  government: "Government Added",
  worker_approved: "Worker-Requested · Government Approved",
  verified: "Verified (OpenStreetMap)",
};

const SOURCE_FLAG = {
  demo: "DEMO",
  government: "GOVERNMENT",
  worker_approved: "WORKER_APPROVED",
  verified: "VERIFIED",
};

function common(l, nowMs) {
  return {
    id: l.id,
    name: l.name,
    latitude: l.latitude,
    longitude: l.longitude,
    area: deriveArea(l.address),
    address: l.address || l.name,
    description: l.description,
    status: l.status,
    lastUpdated: relativeTime(l.updatedAt, nowMs),
    locationLabel: SOURCE_LABEL[l.source] ?? "",
    source: SOURCE_FLAG[l.source] ?? "GOVERNMENT",
    isDemo: Boolean(l.isDemo),
    requestId: l.requestId ?? null,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    createdBy: l.createdBy,
  };
}

export function locationToBin(l, nowMs) {
  const fill = Number.isFinite(l.details?.fillLevel) ? l.details.fillLevel : 0;
  return {
    ...common(l, nowMs),
    category: "bin",
    type: l.details?.wasteType ?? "Mixed Waste",
    fillLevel: fill,
    history: l.details?.history ?? [0, 0, 0, 0, 0, fill],
  };
}

export function locationToToilet(l, nowMs) {
  return {
    ...common(l, nowMs),
    category: "toilet",
    openingHours: l.details?.openingHours ?? "Not specified",
    cleanliness: l.details?.cleanliness ?? 3,
    distance: "",
    facilities: l.details?.facilities ?? ["Men", "Women"],
  };
}

export function locationToBuilding(l, nowMs) {
  return {
    ...common(l, nowMs),
    category: "building",
    buildingType: l.type,
    typeLabel: BUILDING_TYPE_LABELS[l.type] ?? l.type,
    icon: BUILDING_TYPE_ICONS[l.type] ?? "📍",
  };
}

/** Splits a flat API list into the three shapes. */
export function splitLocations(locations, nowMs = Date.now()) {
  const bins = [];
  const toilets = [];
  const buildings = [];
  for (const l of locations) {
    if (l.type === "dustbin") bins.push(locationToBin(l, nowMs));
    else if (l.type === "public_toilet") toilets.push(locationToToilet(l, nowMs));
    else if (isBuildingType(l.type)) buildings.push(locationToBuilding(l, nowMs));
  }
  return { bins, toilets, buildings };
}

/** The reverse direction: a UI form → the API payload. */
export function binToPayload({ name, address, latitude, longitude, type, fillLevel, description }) {
  return {
    name,
    type: "dustbin",
    latitude,
    longitude,
    address,
    description,
    details: { wasteType: type, fillLevel },
  };
}

export function toiletToPayload({ name, address, latitude, longitude, openingHours, facilities, status, description }) {
  return {
    name,
    type: "public_toilet",
    latitude,
    longitude,
    address,
    description,
    ...(status ? { status } : {}),
    details: { openingHours, facilities },
  };
}
