// Cities the citizen can switch between from the Home screen.
//
// Sourced from the full India location dataset (data/indiaLocations.js —
// all 28 states + 8 UTs, 598 districts, 528 cities/towns with population
// > 100,000 and real coordinates). See that file for data sources and
// the CitySelector component for the searchable state -> district -> city
// picker built on top of it.
//
// DATA ACCURACY NOTE: the demo bin/toilet dataset (data/bins.js,
// data/toilets.js) only covers Lucknow. Choosing another city recentres
// the map and filters the counts to facilities actually near that city,
// so it honestly shows "none mapped yet" rather than pretending.
export { CITIES } from "./indiaLocations";

export const DEFAULT_CITY_ID = "lucknow-up";

// Facilities within this many km of a city's centre count as "in" it.
export const CITY_RADIUS_KM = 40;

function distanceKm(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function inCity(item, city) {
  if (typeof item.latitude !== "number" || typeof item.longitude !== "number") return false;
  return distanceKm(city.latitude, city.longitude, item.latitude, item.longitude) <= CITY_RADIUS_KM;
}
