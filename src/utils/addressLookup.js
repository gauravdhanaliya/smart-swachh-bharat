// When the complaint location picker looks up the street address for its pin.
//
// A GPS watch can report many positions a second while the fix sharpens, and
// each would be a Nominatim request. Instead, one lookup per picker session:
//   * once the position has settled: accuracy under 50 m, or 3 seconds
//     without moving (more than a few metres);
//   * then again only when the user drags the pin more than 25 m from the
//     place last looked up.
// The lookup itself is cached (services/geocode.js, 4-decimal key).

export const SETTLED_ACCURACY_M = 50;
export const STILL_MS = 3000;
export const MOVE_LOOKUP_M = 25;
const JITTER_M = 5; // GPS wobble smaller than this isn't "moving"

/** Great-circle distance in metres. */
export function distanceMeters(aLat, aLng, bLat, bLng) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * `lookup(lat, lng)` is called when an address is needed. `fix()` for every
 * GPS reading, `movePin()` when the user drags the pin, `stop()` when the
 * picker closes or GPS stops being used.
 */
export function createAddressLookup({ lookup }) {
  let latest = null; // last GPS position
  let lookedUp = null; // where the address was last looked up
  let pinMoved = false; // the user placed the pin: GPS no longer decides
  let timer = null;

  const clear = () => {
    clearTimeout(timer);
    timer = null;
  };

  const run = (lat, lng) => {
    clear();
    lookedUp = { lat, lng };
    lookup(lat, lng);
  };

  const settle = () => {
    if (!lookedUp && !pinMoved && latest) run(latest.lat, latest.lng);
  };

  return {
    fix(lat, lng, accuracy) {
      if (lookedUp || pinMoved) return; // settled already: once per session
      const moved = !latest || distanceMeters(latest.lat, latest.lng, lat, lng) > JITTER_M;
      latest = { lat, lng };
      if (accuracy < SETTLED_ACCURACY_M) return settle();
      if (moved || !timer) {
        clear();
        timer = setTimeout(settle, STILL_MS);
      }
    },

    movePin(lat, lng) {
      pinMoved = true;
      if (!lookedUp || distanceMeters(lookedUp.lat, lookedUp.lng, lat, lng) > MOVE_LOOKUP_M) run(lat, lng);
    },

    stop() {
      clear();
    },
  };
}
