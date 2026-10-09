// Demo waste-bin data for the Step 2 prototype (Roorkee).
// Shape mirrors what a future `GET /api/bins` response would return.
//
// DATA ACCURACY NOTE (Step 11): these are prototype/demo coordinates
// used to populate the map for demo purposes. They are NOT verified
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
    name: "Roorkee Railway Station",
    latitude: 29.8664,
    longitude: 77.889,
    area: "Railway Station",
    type: "Mixed Waste",
    fillLevel: 35,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "2 mins ago",
    address: "Roorkee Railway Station, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [12, 18, 24, 28, 30, 35],
  },
  {
    id: "DW-1024",
    name: "IIT Roorkee Main Gate",
    latitude: 29.8649,
    longitude: 77.8966,
    area: "IIT Roorkee",
    type: "Dry Waste",
    fillLevel: 78,
    status: BIN_STATUS.ALMOST_FULL,
    lastUpdated: "4 mins ago",
    address: "IIT Roorkee Main Gate, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [40, 48, 55, 63, 70, 78],
  },
  {
    id: "DW-1025",
    name: "Roorkee Bus Stand",
    latitude: 29.87,
    longitude: 77.888,
    area: "Bus Stand",
    type: "Mixed Waste",
    fillLevel: 95,
    status: BIN_STATUS.OVERFLOW,
    lastUpdated: "1 min ago",
    address: "Roorkee Bus Stand, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [60, 68, 75, 84, 90, 95],
  },
  {
    id: "DW-1026",
    name: "Civil Lines Market",
    latitude: 29.8725,
    longitude: 77.8905,
    area: "Civil Lines",
    type: "Wet Waste",
    fillLevel: 55,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "6 mins ago",
    address: "Civil Lines Market, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [20, 28, 35, 42, 48, 55],
  },
  {
    id: "DW-1027",
    name: "Main Bazaar, Roorkee",
    latitude: 29.8543,
    longitude: 77.888,
    area: "Main Bazaar",
    type: "Wet Waste",
    fillLevel: 88,
    status: BIN_STATUS.ALMOST_FULL,
    lastUpdated: "3 mins ago",
    address: "Main Bazaar, Roorkee, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [50, 58, 66, 74, 82, 88],
  },
  {
    id: "DW-1028",
    name: "COER University Main Gate",
    latitude: 29.9008,
    longitude: 77.9772,
    area: "COER Main Gate",
    type: "Dry Waste",
    fillLevel: 22,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "8 mins ago",
    address: "COER University Main Gate, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [10, 14, 16, 18, 20, 22],
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
