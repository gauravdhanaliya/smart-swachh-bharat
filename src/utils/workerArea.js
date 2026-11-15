// Where a worker's map should look: their own tasks first; with none, the
// city named in their area ("Roorkee City & Railway Station" -> Roorkee);
// failing that, the app's default city. Never a hard-coded city.
import { CITIES, DEFAULT_CITY_ID } from "../data/cities";

const words = (s) => ` ${String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/** The city whose name appears in the area text (the longest match wins), or the default city. */
export function cityForArea(area) {
  const text = words(area);
  let best = null;
  for (const c of CITIES) {
    const name = words(c.name).trim();
    if (name && text.includes(` ${name} `) && (!best || name.length > words(best.name).trim().length)) best = c;
  }
  return best ?? CITIES.find((c) => c.id === DEFAULT_CITY_ID) ?? CITIES[0];
}

const located = (t) => Number.isFinite(t?.location?.latitude) && Number.isFinite(t?.location?.longitude);

/** { points, center }: the points to fit (the worker's tasks), or a centre (their area's city) when there are none. */
export function workerMapFrame(worker, tasks) {
  const points = tasks.filter(located).map((t) => ({ latitude: t.location.latitude, longitude: t.location.longitude }));
  const city = cityForArea(worker?.area);
  return { points, center: { latitude: city.latitude, longitude: city.longitude }, cityName: city.name };
}
