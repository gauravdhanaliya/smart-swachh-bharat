// Demo public-toilet data for the Step 2 prototype (COER University, Roorkee).
// Shape mirrors what a future `GET /api/toilets` response would return.
//
// DATA ACCURACY NOTE (Step 11): these are prototype/demo coordinates
// used to populate the map for demo purposes. They are NOT verified
// municipal facility locations — none of these coordinates have been
// checked against an official source, so none are labeled "verified".

export const TOILET_STATUS = {
  OPEN: "Open",
  CLOSED: "Closed",
  MAINTENANCE: "Maintenance",
};

export const toilets = [
  {
    id: "PT-001",
    name: "COER Main Gate Public Toilet",
    latitude: 29.901,
    longitude: 77.9775,
    area: "COER Main Gate",
    status: TOILET_STATUS.OPEN,
    openingHours: "6:00 AM – 10:00 PM",
    cleanliness: 4,
    distance: "120 m",
    address: "COER Main Gate Public Toilet, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    lastUpdated: "5 mins ago",
    facilities: ["Men", "Women", "Accessible"],
  },
  {
    id: "PT-002",
    name: "COER Hostel Community Toilet",
    latitude: 29.9018,
    longitude: 77.979,
    area: "COER Hostel",
    status: TOILET_STATUS.OPEN,
    openingHours: "24 Hours",
    cleanliness: 3,
    distance: "350 m",
    address: "COER Hostel Community Toilet, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    lastUpdated: "12 mins ago",
    facilities: ["Men", "Women"],
  },
  {
    id: "PT-003",
    name: "Vardhman Puram Bus Stop Toilet",
    latitude: 29.8993,
    longitude: 77.9758,
    area: "Vardhman Puram",
    status: TOILET_STATUS.MAINTENANCE,
    openingHours: "6:00 AM – 9:00 PM",
    cleanliness: 3,
    distance: "500 m",
    address: "Vardhman Puram Bus Stop Toilet, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    lastUpdated: "20 mins ago",
    facilities: ["Men", "Women"],
  },
  {
    id: "PT-004",
    name: "COER Sports Ground Toilet",
    latitude: 29.9027,
    longitude: 77.9798,
    area: "COER Sports Ground",
    status: TOILET_STATUS.OPEN,
    openingHours: "5:30 AM – 10:30 PM",
    cleanliness: 5,
    distance: "600 m",
    address: "COER Sports Ground Toilet, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    lastUpdated: "3 mins ago",
    facilities: ["Men", "Women", "Accessible"],
  },
];

/**
 * Simulates GET /api/toilets.
 * Kept async so callers don't need to change when this is wired to a
 * real backend later.
 */
export function getToilets() {
  return Promise.resolve(toilets);
}

/**
 * Simulates GET /api/toilets/:id.
 */
export function getToiletById(id) {
  return Promise.resolve(toilets.find((t) => t.id === id) ?? null);
}
