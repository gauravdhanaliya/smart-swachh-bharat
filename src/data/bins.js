// Waste-bin constants shared by the screens. The bins themselves come from
// the EcoSetu API (GET /api/locations?type=dustbin) — see
// services/facilityService.js. Simulated demo bins are seeded on the server
// (server/src/seed-data.js) and are flagged isDemo.

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
