// Demo waste-bin data for the Step 2 prototype (COER University, Roorkee).
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
    name: "COER University Main Gate",
    latitude: 29.9008,
    longitude: 77.9772,
    area: "COER Main Gate",
    type: "Dry Waste",
    fillLevel: 35,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "2 mins ago",
    address: "COER University Main Gate, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [12, 18, 24, 28, 30, 35],
  },
  {
    id: "DW-1024",
    name: "COER Hostel Block",
    latitude: 29.9015,
    longitude: 77.9786,
    area: "COER Hostel",
    type: "Wet Waste",
    fillLevel: 78,
    status: BIN_STATUS.ALMOST_FULL,
    lastUpdated: "4 mins ago",
    address: "COER Hostel Block, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [40, 48, 55, 63, 70, 78],
  },
  {
    id: "DW-1025",
    name: "COER Canteen",
    latitude: 29.8999,
    longitude: 77.9779,
    area: "COER Canteen",
    type: "Mixed Waste",
    fillLevel: 95,
    status: BIN_STATUS.OVERFLOW,
    lastUpdated: "1 min ago",
    address: "COER Canteen, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [60, 68, 75, 84, 90, 95],
  },
  {
    id: "DW-1026",
    name: "COER Academic Block",
    latitude: 29.9021,
    longitude: 77.9768,
    area: "COER Academic Block",
    type: "Dry Waste",
    fillLevel: 55,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "6 mins ago",
    address: "COER Academic Block, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [20, 28, 35, 42, 48, 55],
  },
  {
    id: "DW-1027",
    name: "Haridwar Road Bus Stop, Vardhman Puram",
    latitude: 29.899,
    longitude: 77.9755,
    area: "Vardhman Puram",
    type: "Mixed Waste",
    fillLevel: 88,
    status: BIN_STATUS.ALMOST_FULL,
    lastUpdated: "3 mins ago",
    address: "Haridwar Road Bus Stop, Vardhman Puram, Roorkee, Uttarakhand",
    locationLabel: "Demo Location",
    history: [50, 58, 66, 74, 82, 88],
  },
  {
    id: "DW-1028",
    name: "COER Sports Ground",
    latitude: 29.903,
    longitude: 77.9795,
    area: "COER Sports Ground",
    type: "Wet Waste",
    fillLevel: 22,
    status: BIN_STATUS.NORMAL,
    lastUpdated: "8 mins ago",
    address: "COER Sports Ground, Roorkee, Uttarakhand",
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
