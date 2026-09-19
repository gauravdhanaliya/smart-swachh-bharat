// Demo public-toilet data for the Step 2 prototype (Lucknow).
// Shape mirrors what a future `GET /api/toilets` response would return.
//
// DATA ACCURACY NOTE (Step 11): these are prototype/demo coordinates
// used to populate the map for the SIH demo. They are NOT verified
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
    name: "Gomti Nagar Public Toilet",
    latitude: 26.8481,
    longitude: 80.9491,
    area: "Gomti Nagar",
    status: TOILET_STATUS.OPEN,
    openingHours: "6:00 AM – 10:00 PM",
    cleanliness: 4,
    distance: "350 m",
    address: "Gomti Nagar, Lucknow",
    locationLabel: "Demo Location",
    lastUpdated: "5 mins ago",
    facilities: ["Men", "Women", "Accessible"],
  },
  {
    id: "PT-002",
    name: "Hazratganj Community Toilet",
    latitude: 26.8524,
    longitude: 80.9438,
    area: "Hazratganj",
    status: TOILET_STATUS.OPEN,
    openingHours: "24 Hours",
    cleanliness: 3,
    distance: "700 m",
    address: "Hazratganj, Lucknow",
    locationLabel: "Demo Location",
    lastUpdated: "12 mins ago",
    facilities: ["Men", "Women"],
  },
  {
    id: "PT-003",
    name: "Aliganj Sulabh Complex",
    latitude: 26.8934,
    longitude: 80.9251,
    area: "Aliganj",
    status: TOILET_STATUS.CLOSED,
    openingHours: "6:00 AM – 9:00 PM",
    cleanliness: 2,
    distance: "1.1 km",
    address: "Aliganj, Lucknow",
    locationLabel: "Demo Location",
    lastUpdated: "20 mins ago",
    facilities: ["Men", "Women"],
  },
  {
    id: "PT-004",
    name: "Indira Nagar Park Toilet",
    latitude: 26.8779,
    longitude: 80.9916,
    area: "Indira Nagar",
    status: TOILET_STATUS.OPEN,
    openingHours: "5:30 AM – 10:30 PM",
    cleanliness: 5,
    distance: "480 m",
    address: "Indira Nagar, Lucknow",
    locationLabel: "Demo Location",
    lastUpdated: "3 mins ago",
    facilities: ["Men", "Women", "Accessible"],
  },
  {
    id: "PT-005",
    name: "Alambagh Station Toilet",
    latitude: 26.8121,
    longitude: 80.9175,
    area: "Alambagh",
    status: TOILET_STATUS.OPEN,
    openingHours: "24 Hours",
    cleanliness: 3,
    distance: "900 m",
    address: "Alambagh, Lucknow",
    locationLabel: "Demo Location",
    lastUpdated: "9 mins ago",
    facilities: ["Men", "Women"],
  },
  {
    id: "PT-006",
    name: "Chowk Heritage Toilet",
    latitude: 26.8641,
    longitude: 80.9089,
    area: "Chowk",
    status: TOILET_STATUS.MAINTENANCE,
    openingHours: "6:00 AM – 9:00 PM",
    cleanliness: 4,
    distance: "600 m",
    address: "Chowk, Lucknow",
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
