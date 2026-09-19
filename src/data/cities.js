// Cities the citizen can switch between from the Home screen.
//
// DATA ACCURACY NOTE: the demo bin/toilet dataset (data/bins.js,
// data/toilets.js) only covers Lucknow. Choosing another city recentres
// the map and filters the counts to facilities actually near that city,
// so it honestly shows "none mapped yet" rather than pretending.
export const CITIES = [
  { id: "lucknow", name: "Lucknow", state: "Uttar Pradesh", latitude: 26.8467, longitude: 80.9462 },
  { id: "kanpur", name: "Kanpur", state: "Uttar Pradesh", latitude: 26.4499, longitude: 80.3319 },
  { id: "varanasi", name: "Varanasi", state: "Uttar Pradesh", latitude: 25.3176, longitude: 82.9739 },
  { id: "prayagraj", name: "Prayagraj", state: "Uttar Pradesh", latitude: 25.4358, longitude: 81.8463 },
  { id: "agra", name: "Agra", state: "Uttar Pradesh", latitude: 27.1767, longitude: 78.0081 },
  { id: "meerut", name: "Meerut", state: "Uttar Pradesh", latitude: 28.9845, longitude: 77.7064 },
];

export const DEFAULT_CITY_ID = "lucknow";

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
