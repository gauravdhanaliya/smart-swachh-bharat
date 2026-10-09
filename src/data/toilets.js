// Demo public-toilet data for the Step 2 prototype (Roorkee).
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
    name: "Roorkee Railway Station Toilet",
    latitude: 29.8666,
    longitude: 77.8893,
    area: "Railway Station",
    status: TOILET_STATUS.OPEN,
    openingHours: "24 Hours",
    cleanliness: 4,
    distance: "300 m",
    address: "Roorkee Railway Station Toilet, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    lastUpdated: "5 mins ago",
    facilities: ["Men", "Women", "Accessible"],
  },
  {
    id: "PT-002",
    name: "Roorkee Bus Stand Toilet",
    latitude: 29.8702,
    longitude: 77.8884,
    area: "Bus Stand",
    status: TOILET_STATUS.OPEN,
    openingHours: "24 Hours",
    cleanliness: 3,
    distance: "450 m",
    address: "Roorkee Bus Stand Toilet, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    lastUpdated: "12 mins ago",
    facilities: ["Men", "Women"],
  },
  {
    id: "PT-003",
    name: "Civil Lines Community Toilet",
    latitude: 29.8727,
    longitude: 77.8908,
    area: "Civil Lines",
    status: TOILET_STATUS.MAINTENANCE,
    openingHours: "6:00 AM – 9:00 PM",
    cleanliness: 3,
    distance: "700 m",
    address: "Civil Lines Community Toilet, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    lastUpdated: "20 mins ago",
    facilities: ["Men", "Women"],
  },
  {
    id: "PT-004",
    name: "Main Bazaar Sulabh Complex",
    latitude: 29.8546,
    longitude: 77.8884,
    area: "Main Bazaar",
    status: TOILET_STATUS.OPEN,
    openingHours: "5:30 AM – 10:30 PM",
    cleanliness: 5,
    distance: "900 m",
    address: "Main Bazaar Sulabh Complex, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    lastUpdated: "3 mins ago",
    facilities: ["Men", "Women", "Accessible"],
  },
  {
    id: "PT-005",
    name: "COER University Public Toilet",
    latitude: 29.901,
    longitude: 77.9775,
    area: "COER Main Gate",
    status: TOILET_STATUS.OPEN,
    openingHours: "6:00 AM – 10:00 PM",
    cleanliness: 4,
    distance: "1.2 km",
    address: "COER University Public Toilet, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    lastUpdated: "7 mins ago",
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
