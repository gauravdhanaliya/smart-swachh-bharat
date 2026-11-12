// Shared test data. Written straight into the local API's storage key so
// screens load it exactly as they would load a returning user's saved data.

export const LOCAL_API_KEY = "ssb_local_api_v1";

const base = {
  description: "",
  source: "government",
  requestId: null,
  createdBy: "Demo Official",
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-06-01T08:00:00.000Z",
  isDemo: false,
};

// Bin records as an older build saved them: a fill percentage, a history of
// percentages, and (for DB-002) no usable status at all.
export const LEGACY_BINS = [
  {
    ...base,
    id: "DB-001",
    name: "Library Bin",
    type: "dustbin",
    latitude: 29.8908,
    longitude: 77.9606,
    address: "Central Library, COER University",
    status: "normal",
    details: { wasteType: "Dry Waste", fillLevel: 42, history: [10, 20, 30, 35, 40, 42] },
  },
  {
    ...base,
    id: "DB-002",
    name: "Canteen Bin",
    type: "dustbin",
    latitude: 29.8904,
    longitude: 77.9614,
    address: "Canteen, COER University",
    details: { wasteType: "Wet Waste", fillLevel: 95, history: [50, 60, 70, 80, 90, 95] },
  },
  {
    ...base,
    id: "DB-003",
    name: "Hostel Bin",
    type: "dustbin",
    latitude: 29.892,
    longitude: 77.9615,
    address: "Boys Hostel, COER University",
    status: "almost_full",
    details: { wasteType: "Mixed Waste", fillLevel: 80 },
  },
];

export const TOILETS = [
  {
    ...base,
    id: "PT-001",
    name: "Main Gate Toilet",
    type: "public_toilet",
    latitude: 29.8884,
    longitude: 77.9589,
    address: "Main Gate, COER University",
    status: "Open",
    details: { openingHours: "24 Hours", cleanliness: 4, facilities: ["Men", "Women"] },
  },
];

export function seedLocalApi({ locations = [...LEGACY_BINS, ...TOILETS], requests = [] } = {}) {
  localStorage.setItem(LOCAL_API_KEY, JSON.stringify({ locations, requests }));
}

export const storedLocalApi = () => JSON.parse(localStorage.getItem(LOCAL_API_KEY));
