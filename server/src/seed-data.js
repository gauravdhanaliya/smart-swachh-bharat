// Seed data.
//
// VERIFIED (isDemo: false)
//   - COER University campus: OpenStreetMap way 1213831733, returned by the
//     Nominatim geocoder (centroid 29.8905429, 77.9594553; bounding box
//     lat 29.8873215–29.8937887, lng 77.9574428–77.9628839). © OpenStreetMap
//     contributors, ODbL 1.0.
//
// DEMO (isDemo: true)
//   - Every building below is SIMULATED. Coordinates are
//     illustrative points placed inside the campus bounding box above — they
//     are NOT surveyed building positions and must never be presented as
//     verified facilities. Replace them with real data (see
//     server/README.md, "Importing verified coordinates").

export const CAMPUS = {
  id: "CP-001",
  name: "COER University (campus)",
  type: "campus",
  latitude: 29.8905429,
  longitude: 77.9594553,
  description:
    "Verified reference point: OpenStreetMap way 1213831733 (centroid). Data © OpenStreetMap contributors, ODbL.",
  address: "NH334, Roorkee, Haridwar, Uttarakhand 247667",
  status: "Open",
  details: {
    osm: "way/1213831733",
    bbox: { south: 29.8873215, north: 29.8937887, west: 77.9574428, east: 77.9628839 },
  },
  source: "verified",
  isDemo: false,
};

const DEMO_NOTE = "DEMO — simulated location, not a verified campus position.";

export const DEMO_BUILDINGS = [
  ["Main Gate", "main_gate", 29.8884, 77.9589],
  ["Academic Block A", "academic_building", 29.8901, 77.9595],
  ["Academic Block B", "academic_building", 29.8906, 77.9599],
  ["Academic Block C", "academic_building", 29.891, 77.9603],
  ["Computer Science Department", "department_building", 29.8912, 77.961],
  ["Mechanical Department", "department_building", 29.8903, 77.9608],
  ["Central Library", "library", 29.8908, 77.9606],
  ["Administrative Block", "admin_block", 29.89, 77.9602],
  ["Boys Hostel", "hostel", 29.892, 77.9615],
  ["Girls Hostel", "hostel", 29.8923, 77.9605],
  ["Canteen", "canteen", 29.8904, 77.9614],
].map(([name, type, latitude, longitude]) => ({
  name: `${name} (DEMO)`,
  type,
  latitude,
  longitude,
  description: DEMO_NOTE,
  address: "COER University, Roorkee",
  status: "Open",
  details: {},
  source: "demo",
  isDemo: true,
}));

// Simulated requests (a pending and a rejected one). There are no demo
// dustbins or toilets: those come only from officials or approved requests.
export const DEMO_REQUESTS = [
  {
    id: "FR-2026-001",
    facilityType: "Dustbin",
    suggestedName: "Dustbin near COER main gate (DEMO)",
    address: "Near COER main gate (DEMO)",
    latitude: 29.8883,
    longitude: 77.9588,
    reason: "No dustbin within 200m of the main gate; students dump waste on the roadside.",
    description: "High footfall area during college hours. A segregated 3-bin unit would help most.",
    priority: "HIGH",
    status: "PENDING",
    requestedByWorkerId: "w1",
    requestedByWorkerName: "Vikash Kumar",
    createdAt: "2026-06-02T09:10:00.000Z",
  },
  {
    id: "FR-2026-003",
    facilityType: "Dustbin",
    suggestedName: "Extra dustbin, demo location",
    address: "Demo location, COER University",
    latitude: 29.8905,
    longitude: 77.9601,
    reason: "Sample rejected request for demo purposes.",
    description: "Prototype example showing the rejection-reason state.",
    priority: "LOW",
    status: "REJECTED",
    rejectionReason: "A dustbin already exists within 50m of this location.",
    requestedByWorkerId: "w1",
    requestedByWorkerName: "Vikash Kumar",
    createdAt: "2026-05-10T08:30:00.000Z",
  },
];
