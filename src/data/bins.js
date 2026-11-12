// Waste-bin constants shared by the screens. The bins themselves come from
// the EcoSetu API (GET /api/locations?type=dustbin) — see
// services/facilityService.js.
//
// A bin is described by a categorical status only. There is no fill
// percentage anywhere in the app; records saved by older builds (which had
// one) are converted by migrateBinLocation / normalizeBinStatus.

export { normalizeBinStatus, migrateBinLocation } from "../../server/src/constants.js";

export const BIN_STATUS = {
  NORMAL: "normal",
  ALMOST_FULL: "almost_full",
  OVERFLOW: "overflow",
};

export const BIN_STATUS_LABELS = {
  normal: "Normal",
  almost_full: "Almost Full",
  overflow: "Overflow",
};

// One plain-language line per status, shown on the bin details screen.
export const BIN_STATUS_HINTS = {
  normal: "This bin has room.",
  almost_full: "Getting full — due for collection soon.",
  overflow: "Overflowing — needs collection now.",
};
