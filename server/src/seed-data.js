// Seed data.
//
// VERIFIED (isDemo: false)
//   - COER University campus: OpenStreetMap way 1213831733, returned by the
//     Nominatim geocoder (centroid 29.8905429, 77.9594553; bounding box
//     lat 29.8873215–29.8937887, lng 77.9574428–77.9628839). © OpenStreetMap
//     contributors, ODbL 1.0.
//
// DEMO (isDemo: true)
//   - Every building, dustbin and public toilet below is SIMULATED.
//     Coordinates are illustrative points placed inside the campus bounding
//     box above — they are NOT surveyed positions and must never be presented
//     as verified facilities. Replace them with real data (see
//     server/README.md, "Importing verified coordinates").
//
// Every record has a FIXED id, so seeding is idempotent: running it again
// inserts only what is missing and never touches a record that exists (even
// one an official has since edited). Demo bins and toilets use "D" ids
// (DB-D01, PT-D01) so they can never collide with the numbered ids the API
// generates for real facilities.

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
].map(([name, type, latitude, longitude], i) => ({
  // The same ids the first seeded databases generated, in the same order.
  id: `BL-${String(i + 1).padStart(3, "0")}`,
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

const BIN_NOTE = "DEMO — simulated dustbin, not a verified position.";
const TOILET_NOTE = "DEMO — simulated public toilet, not a verified position.";

// Demo dustbins, in a mix of statuses so the map and dashboards have
// something to show. statusSource "simulated": the demo ticker may move them.
export const DEMO_BINS = [
  ["Main Gate Dustbin", 29.8885, 77.9591, "Mixed Waste", "overflow", "Near COER main gate"],
  ["Academic Block A Dustbin", 29.89, 77.9593, "Dry Waste", "normal", "Academic Block A, COER University"],
  ["Central Library Dustbin", 29.8909, 77.9604, "Dry Waste", "normal", "Central Library, COER University"],
  ["Canteen Wet Waste Bin", 29.8905, 77.9616, "Wet Waste", "almost_full", "Canteen, COER University"],
  ["Canteen Dry Waste Bin", 29.8906, 77.9617, "Dry Waste", "normal", "Canteen, COER University"],
  ["Boys Hostel Dustbin", 29.8919, 77.9617, "Mixed Waste", "almost_full", "Boys Hostel, COER University"],
  ["Girls Hostel Dustbin", 29.8924, 77.9603, "Mixed Waste", "normal", "Girls Hostel, COER University"],
  ["CS Department Dustbin", 29.8913, 77.9611, "Dry Waste", "overflow", "Computer Science Department, COER University"],
].map(([name, latitude, longitude, wasteType, status, address], i) => ({
  id: `DB-D${String(i + 1).padStart(2, "0")}`,
  name: `${name} (DEMO)`,
  type: "dustbin",
  latitude,
  longitude,
  description: BIN_NOTE,
  address,
  status,
  statusSource: "simulated",
  details: { wasteType },
  source: "demo",
  isDemo: true,
}));

// Demo public toilets, so toilet ratings have something to rate.
export const DEMO_TOILETS = [
  ["Main Gate Public Toilet", 29.8887, 77.9586, "Open", "24 Hours", ["Men", "Women", "Accessible"], "Near COER main gate"],
  ["Academic Block Toilet", 29.8903, 77.9597, "Open", "8:00 AM – 6:00 PM", ["Men", "Women"], "Academic Block A, COER University"],
  ["Library Toilet", 29.891, 77.9607, "Maintenance", "9:00 AM – 8:00 PM", ["Men", "Women", "Accessible"], "Central Library, COER University"],
  ["Hostel Block Toilet", 29.8921, 77.9611, "Open", "6:00 AM – 10:00 PM", ["Men", "Women"], "Between the hostels, COER University"],
].map(([name, latitude, longitude, status, openingHours, facilities, address], i) => ({
  id: `PT-D${String(i + 1).padStart(2, "0")}`,
  name: `${name} (DEMO)`,
  type: "public_toilet",
  latitude,
  longitude,
  description: TOILET_NOTE,
  address,
  status,
  details: { openingHours, cleanliness: 4, facilities },
  source: "demo",
  isDemo: true,
}));

// The demo worker directory (the same two people as src/data/workers.js).
export const DEMO_WORKERS = [
  { id: "w1", displayId: "W001", name: "Vikash Kumar", role: "Sanitation Worker", area: "Roorkee City & Railway Station", status: "Available", phoneMasked: "+91 98XXXXXX01" },
  { id: "w2", displayId: "W002", name: "Ramesh Kumar", role: "Sanitation Worker", area: "COER University & Haridwar Road", status: "On Duty", phoneMasked: "+91 98XXXXXX02" },
];

// Demo accounts for the labelled demo login. A Firebase sign-in (anonymous,
// email or phone) can never reach them: only POST /api/auth/demo can.
export const DEMO_USERS = [
  { uid: "demo-citizen", role: "citizen", name: "Demo Citizen", workerId: null },
  { uid: "demo-worker", role: "worker", name: "Vikash Kumar", workerId: "w1" },
  { uid: "demo-official", role: "official", name: "Demo Official", workerId: null },
];

// Simulated requests (a pending and a rejected one).
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
