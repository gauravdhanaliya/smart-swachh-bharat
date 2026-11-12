// Shared by the API (geocode.js) and the web app (src/services/geocode.js).

export const GEO_BUSY_MESSAGE = "Search is busy, try again in a moment";

/** Lower-case, single spaces: "  Roorkee  Station " and "roorkee station" are one search. */
export function normaliseQuery(q) {
  return String(q ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * 4 decimals (about 11 m): nearby positions share one street-address lookup,
 * and Nominatim never gets a position more precise than that.
 */
export const roundCoord = (n) => Number(Number(n).toFixed(4));
