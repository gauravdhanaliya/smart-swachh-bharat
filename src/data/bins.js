// Demo waste-bin data for the Step 2 prototype (Lucknow).
// Shape mirrors what a future `GET /api/bins` response would return.
//
// DATA ACCURACY NOTE (Step 11): these are prototype/demo coordinates
// used to populate the map for the SIH demo. They are NOT verified
// official municipal bin locations. See README.md for how this is
// disclosed to anyone viewing the app.

export const BIN_STATUS = {
  NORMAL: "normal",
  ALMOST_FULL: "almost_full",
  OVERFLOW: "overflow",
};

// Fill-level thresholds used to derive status from fillLevel.
export const FILL_THRESHOLDS = {
  ALMOST_FULL: 71,
  OVERFLOW: 91,
};

export function statusFromFillLevel(fillLevel) {
  if (fillLevel >= FILL_THRESHOLDS.OVERFLOW) return BIN_STATUS.OVERFLOW;
  if (fillLevel >= FILL_THRESHOLDS.ALMOST_FULL) return BIN_STATUS.ALMOST_FULL;
  return BIN_STATUS.NORMAL;
}

export const bins = [
  {
    id: "DW-1023",
    name: "Gomti Nagar Park",
    latitude: 26.8467,
    longitude: 80.9462,
    area: "Gomti Nagar",
    type: "Dry Waste",
    fillLevel: 35,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "2 mins ago",
    address: "Gomti Nagar, Lucknow",
    locationLabel: "Demo Location",
    history: [12, 18, 24, 28, 30, 35],
  },
  {
    id: "DW-1024",
    name: "Hazratganj Market",
    latitude: 26.8508,
    longitude: 80.9462,
    area: "Hazratganj",
    type: "Wet Waste",
    fillLevel: 78,
    status: BIN_STATUS.ALMOST_FULL,
    lastUpdated: "4 mins ago",
    address: "Hazratganj, Lucknow",
    locationLabel: "Demo Location",
    history: [40, 48, 55, 63, 70, 78],
  },
  {
    id: "DW-1025",
    name: "Aliganj Sector D",
    latitude: 26.8912,
    longitude: 80.9219,
    area: "Aliganj",
    type: "Mixed Waste",
    fillLevel: 95,
    status: BIN_STATUS.OVERFLOW,
    lastUpdated: "1 min ago",
    address: "Aliganj, Lucknow",
    locationLabel: "Demo Location",
    history: [60, 68, 75, 84, 90, 95],
  },
  {
    id: "DW-1026",
    name: "Indira Nagar Main Road",
    latitude: 26.8757,
    longitude: 80.9942,
    area: "Indira Nagar",
    type: "Dry Waste",
    fillLevel: 55,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "6 mins ago",
    address: "Indira Nagar, Lucknow",
    locationLabel: "Demo Location",
    history: [20, 28, 35, 42, 48, 55],
  },
  {
    id: "DW-1027",
    name: "Alambagh Bus Station",
    latitude: 26.8103,
    longitude: 80.9147,
    area: "Alambagh",
    type: "Mixed Waste",
    fillLevel: 88,
    status: BIN_STATUS.ALMOST_FULL,
    lastUpdated: "3 mins ago",
    address: "Alambagh, Lucknow",
    locationLabel: "Demo Location",
    history: [50, 58, 66, 74, 82, 88],
  },
  {
    id: "DW-1028",
    name: "Chowk Old City",
    latitude: 26.8624,
    longitude: 80.9066,
    area: "Chowk",
    type: "Wet Waste",
    fillLevel: 22,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "8 mins ago",
    address: "Chowk, Lucknow",
    locationLabel: "Demo Location",
    history: [10, 14, 16, 18, 20, 22],
  },
  {
    id: "DW-1029",
    name: "Vibhuti Khand",
    latitude: 26.8563,
    longitude: 80.9994,
    area: "Vibhuti Khand",
    type: "Dry Waste",
    fillLevel: 97,
    status: BIN_STATUS.OVERFLOW,
    lastUpdated: "Just now",
    address: "Vibhuti Khand, Gomti Nagar, Lucknow",
    locationLabel: "Demo Location",
    history: [65, 74, 82, 88, 93, 97],
  },
  {
    id: "DW-1030",
    name: "Mahanagar Crossing",
    latitude: 26.8697,
    longitude: 80.9386,
    area: "Mahanagar",
    type: "Mixed Waste",
    fillLevel: 48,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "5 mins ago",
    address: "Mahanagar, Lucknow",
    locationLabel: "Demo Location",
    history: [18, 24, 30, 36, 42, 48],
  },
];

/**
 * Simulates GET /api/bins.
 * Kept async so callers don't need to change when this is wired to a
 * real backend later.
 */
export function getBins() {
  return Promise.resolve(bins);
}

/**
 * Simulates GET /api/bins/:id.
 */
export function getBinById(id) {
  return Promise.resolve(bins.find((b) => b.id === id) ?? null);
}
