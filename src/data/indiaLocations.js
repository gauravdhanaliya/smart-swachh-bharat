// Complete India location dataset: Country → State/UT → District → City/Town.
//
// DATA SOURCES (bundled at build time, no network calls at runtime):
//  - States, Union Territories & districts: scraped from the Ministry of
//    Electronics & IT's igod.gov.in government directory (598 districts
//    across all 28 states + 8 UTs, Ladakh included).
//  - Cities/towns with coordinates: Census of India 2011 population data
//    (every city/town with population > 100,000 — 528 in total), each
//    carrying its own lat/lng, district and state.
//
// HONESTY NOTE: not every one of the 598 districts has a city/town in the
// coordinate dataset (many mid-size district HQs fall under the 100k
// population cut-off, and a few districts are 2022-era splits the 2011
// city list predates). Browsing a district with no listed town shows that
// honestly instead of guessing a coordinate — see EMPTY_DISTRICT handling
// in CitySelector, which offers "Add custom location" pre-filled with the
// state/district name instead of faking a pin.
import RAW from "./indiaLocations.json";

export const COUNTRY = "India";
export const STATES = RAW.states; // [{ id, name, type: 'state'|'ut', latitude, longitude }]
export const DISTRICTS = RAW.districts; // [{ id, name, stateId }]

// Cities in the exact shape data/cities.js (and everything downstream —
// cityService, useCity, useLiveBins/inCity) already expects: id, name,
// state, latitude, longitude. `district` and `stateId` are additive.
export const CITIES = RAW.cities;

const norm = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").trim();

export function getStatesList() {
  return STATES;
}

export function getDistrictsForState(stateId) {
  return DISTRICTS.filter((d) => d.stateId === stateId);
}

export function getCitiesForState(stateId) {
  return CITIES.filter((c) => c.stateId === stateId);
}

/**
 * Cities within a district. Matching is relaxed (normalized
 * exact-or-contains) because the district dataset (current, government) and
 * the city dataset (2011 census) don't always spell/split districts the
 * same way — see the HONESTY NOTE above.
 */
export function getCitiesForDistrict(stateId, districtName) {
  const target = norm(districtName);
  if (!target) return [];
  return CITIES.filter((c) => {
    if (c.stateId !== stateId) return false;
    const d = norm(c.district);
    return d === target || d.includes(target) || target.includes(d);
  });
}

/**
 * Free-text search across city, district and state names. Returns cities
 * (they're the only entries with real coordinates), ranked so
 * name-starts-with beats name-contains beats a district/state match.
 */
export function searchLocations(query, limit = 40) {
  const q = norm(query);
  if (!q) return [];
  const scored = [];
  for (const c of CITIES) {
    const name = norm(c.name);
    const district = norm(c.district);
    const state = norm(c.state);
    let score = -1;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 90;
    else if (name.includes(q)) score = 70;
    else if (district.startsWith(q)) score = 55;
    else if (district.includes(q)) score = 45;
    else if (state.startsWith(q)) score = 30;
    else if (state.includes(q)) score = 20;
    if (score > 0) scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  return scored.slice(0, limit).map((s) => s.c);
}
