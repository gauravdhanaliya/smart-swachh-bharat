import { useMemo, useState } from "react";
import {
  CITIES,
  getCitiesForDistrict,
  getDistrictsForState,
  getStatesList,
  searchLocations,
} from "../data/indiaLocations";

// One location picker used everywhere the app asks "where?" — citizen
// Report Issue, worker facility requests, government Add Facility and the
// Map's "Set area manually". It covers all of India:
//
//   1. Search any city / town / district / state by name, or
//   2. Browse State -> District -> City/Town (all 28 states + 8 UTs), and
//   3. optionally add a locality / landmark (village, colony, ward, gali…),
//      and/or pin the exact spot with the device's GPS.
//
// It always resolves to { address, latitude, longitude } — the same shape
// the rest of the app already stores — plus state/district/city as extras.
//
// DATA NOTE: the bundled dataset (data/indiaLocations.js) has every state
// and UT, 598 districts and the 528 cities/towns above 1 lakh population
// (with real coordinates). Smaller towns and villages aren't in it, so a
// citizen picks the nearest town, types the locality, and can pin the
// exact spot with GPS. Nothing is invented.

const THEMES = {
  emerald: {
    field:
      "w-full rounded-2xl border border-emerald-100 bg-white px-3.5 py-2.5 text-sm text-emerald-950 placeholder:text-emerald-800/40 focus:border-emerald-400 focus:outline-none disabled:bg-emerald-50/50 disabled:text-emerald-800/40",
    label: "text-emerald-800/70",
    chip: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100 hover:bg-emerald-100",
    action: "text-emerald-700 hover:bg-emerald-50",
    card: "border-emerald-100 bg-emerald-50/60 text-emerald-900",
    result: "hover:bg-emerald-50",
    muted: "text-emerald-800/60",
  },
  orange: {
    field:
      "w-full rounded-2xl border border-orange-100 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none disabled:bg-orange-50/50 disabled:text-slate-400",
    label: "text-slate-600",
    chip: "bg-orange-50 text-orange-800 ring-1 ring-orange-100 hover:bg-orange-100",
    action: "text-orange-700 hover:bg-orange-50",
    card: "border-orange-100 bg-orange-50/60 text-orange-900",
    result: "hover:bg-orange-50",
    muted: "text-slate-500",
  },
  sky: {
    field:
      "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400",
    label: "text-slate-500",
    chip: "bg-sky-50 text-sky-800 ring-1 ring-sky-100 hover:bg-sky-100",
    action: "text-sky-700 hover:bg-sky-50",
    card: "border-sky-100 bg-sky-50/60 text-sky-900",
    result: "hover:bg-sky-50",
    muted: "text-slate-500",
  },
};

const norm = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").trim();

function composeAddress(place, locality) {
  const loc = locality.trim();
  if (place.kind === "gps") return loc ? `${loc} (GPS location)` : "Current GPS location";
  const parts = [];
  if (loc) parts.push(loc);
  parts.push(place.name);
  if (place.district && norm(place.district) !== norm(place.name)) parts.push(place.district);
  if (norm(place.state) !== norm(place.name)) parts.push(place.state);
  return parts.join(", ");
}

function compose(place, locality) {
  if (place.kind === "preset") return place.location;
  return {
    address: composeAddress(place, locality),
    latitude: place.latitude,
    longitude: place.longitude,
    ...(place.kind === "city"
      ? { city: place.name, district: place.district, state: place.state }
      : {}),
  };
}

function getGpsFix() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocation isn't supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error("Location permission denied."));
        else if (err.code === err.TIMEOUT) reject(new Error("Couldn't get a location fix in time."));
        else reject(new Error("Location unavailable right now."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

/**
 * @param {object}   props
 * @param {object|null} props.value   Currently chosen { address, latitude, longitude } or null.
 * @param {(loc: object|null) => void} props.onChange  Called with the composed location, or null when cleared.
 * @param {Array}    [props.presets]  Optional quick-pick localities ({address, latitude, longitude}).
 * @param {string}   [props.presetsLabel]
 * @param {"emerald"|"orange"|"sky"} [props.theme]
 * @param {boolean}  [props.allowLocality=true]  Show the "locality / landmark" text box.
 * @param {boolean}  [props.allowGps=true]
 * @param {string}   [props.id]  Prefix for field ids.
 */
export default function IndiaLocationPicker({
  value,
  onChange,
  presets = [],
  presetsLabel = "Quick picks",
  theme = "emerald",
  allowLocality = true,
  allowGps = true,
  id = "india-loc",
}) {
  const t = THEMES[theme] ?? THEMES.emerald;

  const [place, setPlace] = useState(null); // { kind: 'city'|'gps'|'preset', ... }
  const [locality, setLocality] = useState("");
  const [query, setQuery] = useState("");
  const [stateId, setStateId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [gpsStatus, setGpsStatus] = useState("idle"); // idle | locating
  const [gpsError, setGpsError] = useState("");

  const states = useMemo(() => getStatesList(), []);
  const districts = useMemo(() => (stateId ? getDistrictsForState(stateId) : []), [stateId]);
  const district = districts.find((d) => d.id === districtId) ?? null;
  const selectedState = states.find((st) => st.id === stateId) ?? null;

  const { cityOptions, districtHasNoTown } = useMemo(() => {
    if (!stateId) return { cityOptions: [], districtHasNoTown: false };
    if (!district) {
      return { cityOptions: CITIES.filter((c) => c.stateId === stateId), districtHasNoTown: false };
    }
    const inDistrict = getCitiesForDistrict(stateId, district.name);
    if (inDistrict.length > 0) return { cityOptions: inDistrict, districtHasNoTown: false };
    // No mapped town in this district: offer the state's towns so the
    // citizen can pick the nearest one — honest, and still gets real coordinates.
    return { cityOptions: CITIES.filter((c) => c.stateId === stateId), districtHasNoTown: true };
  }, [stateId, district]);

  const results = useMemo(() => (query.trim() ? searchLocations(query, 8) : []), [query]);

  const choosePlace = (next) => {
    setPlace(next);
    setLocality("");
    setQuery("");
    setGpsError("");
    onChange(compose(next, ""));
  };

  const chooseCity = (city) => choosePlace({ kind: "city", ...city });

  const clear = () => {
    setPlace(null);
    setLocality("");
    setGpsError("");
    onChange(null);
  };

  const handleLocality = (text) => {
    setLocality(text);
    if (place) onChange(compose(place, text));
  };

  const handleGps = async () => {
    setGpsStatus("locating");
    setGpsError("");
    try {
      const fix = await getGpsFix();
      if (place?.kind === "city") {
        const next = { ...place, ...fix, pinned: true };
        setPlace(next);
        onChange(compose(next, locality));
      } else {
        choosePlace({ kind: "gps", ...fix });
      }
    } catch (err) {
      setGpsError(err.message);
    } finally {
      setGpsStatus("idle");
    }
  };

  const renderGpsButton = (label) =>
    allowGps ? (
      <div>
        <button
          type="button"
          onClick={handleGps}
          disabled={gpsStatus === "locating"}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-60 ${t.action}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="7" />
          </svg>
          {gpsStatus === "locating" ? "Getting location…" : label}
        </button>
        {gpsError && <p className="px-3 text-xs font-medium text-red-600">{gpsError}</p>}
      </div>
    ) : null;

  // ---- A location is chosen: show a compact summary --------------------
  if (value) {
    return (
      <div className="flex flex-col gap-2">
        <div className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 ${t.card}`}>
          <span aria-hidden="true">📍</span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-snug">{value.address}</p>
            {place?.pinned && <p className={`mt-0.5 text-xs ${t.muted}`}>Exact spot pinned with GPS</p>}
          </div>
          <button
            type="button"
            onClick={clear}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${t.action}`}
          >
            Change
          </button>
        </div>

        {allowLocality && place && place.kind !== "preset" && (
          <div>
            <label htmlFor={`${id}-locality`} className={`mb-1 block text-xs font-medium ${t.label}`}>
              Locality / landmark (optional)
            </label>
            <input
              id={`${id}-locality`}
              type="text"
              value={locality}
              onChange={(e) => handleLocality(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              maxLength={80}
              placeholder="e.g. Sector 5, near bus stand, ward 12, village name"
              className={t.field}
            />
          </div>
        )}

        {allowGps && place && place.kind !== "preset" && !place.pinned && place.kind !== "gps" &&
          renderGpsButton("Pin exact spot with GPS")}
      </div>
    );
  }

  // ---- Nothing chosen yet: search + browse -----------------------------
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor={`${id}-search`} className={`mb-1 block text-xs font-medium ${t.label}`}>
          Search any city, town, district or state in India
        </label>
        <input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Inside a <form>: Enter must pick the top match, not submit the form.
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (results[0]) chooseCity(results[0]);
          }}
          placeholder="e.g. Meerut, Jaipur, Kochi, Guwahati…"
          autoComplete="off"
          className={t.field}
        />
        {query.trim() && (
          <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-md" role="listbox">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500">
                No match. Try the State &rarr; District &rarr; City list below, or use GPS.
              </li>
            ) : (
              results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => chooseCity(c)}
                    className={`flex w-full flex-col rounded-xl px-3 py-2 text-left ${t.result}`}
                  >
                    <span className="text-sm font-semibold text-slate-900">{c.name}</span>
                    <span className="text-xs text-slate-500">
                      {c.district} · {c.state}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or browse
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        <div>
          <label htmlFor={`${id}-state`} className={`mb-1 block text-xs font-medium ${t.label}`}>
            State / Union Territory
          </label>
          <select
            id={`${id}-state`}
            value={stateId}
            onChange={(e) => {
              setStateId(e.target.value);
              setDistrictId("");
            }}
            className={t.field}
          >
            <option value="">Select state / UT…</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-district`} className={`mb-1 block text-xs font-medium ${t.label}`}>
            District
          </label>
          <select
            id={`${id}-district`}
            value={districtId}
            disabled={!stateId}
            onChange={(e) => setDistrictId(e.target.value)}
            className={t.field}
          >
            <option value="">{stateId ? "All districts" : "Select a state first"}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-city`} className={`mb-1 block text-xs font-medium ${t.label}`}>
            City / Town
          </label>
          <select
            id={`${id}-city`}
            value=""
            disabled={!stateId}
            onChange={(e) => {
              const city = CITIES.find((c) => c.id === e.target.value);
              if (city) chooseCity(city);
            }}
            className={t.field}
          >
            <option value="">{stateId ? "Select city / town…" : "Select a state first"}</option>
            {cityOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!district || districtHasNoTown ? ` (${c.district})` : ""}
              </option>
            ))}
          </select>
          {selectedState && cityOptions.length === 0 && (
            <div className="mt-1.5">
              <p className={`text-xs ${t.muted}`}>
                No city or town of {selectedState.name} is in our map data.
              </p>
              <button
                type="button"
                onClick={() =>
                  choosePlace({
                    kind: "city",
                    id: `state-${selectedState.id}`,
                    name: selectedState.name,
                    district: "",
                    state: selectedState.name,
                    latitude: selectedState.latitude,
                    longitude: selectedState.longitude,
                  })
                }
                className={`mt-1 rounded-full px-3 py-1.5 text-xs font-semibold ${t.chip}`}
              >
                Use {selectedState.name} (approximate centre)
              </button>
              <p className={`mt-1 text-xs ${t.muted}`}>
                Then add your locality or pin the exact spot with GPS.
              </p>
            </div>
          )}
          {districtHasNoTown && (
            <p className={`mt-1 text-xs ${t.muted}`}>
              No town in this district is in our map data — pick the nearest town, then add your
              locality or pin the spot with GPS.
            </p>
          )}
        </div>
      </div>

      {renderGpsButton("Use my current GPS location")}

      {presets.length > 0 && (
        <div>
          <p className={`mb-1.5 text-xs font-medium ${t.label}`}>{presetsLabel}</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((loc) => (
              <button
                key={loc.address}
                type="button"
                onClick={() => {
                  setPlace({ kind: "preset", location: loc });
                  setLocality("");
                  onChange(loc);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${t.chip}`}
              >
                {loc.address}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
