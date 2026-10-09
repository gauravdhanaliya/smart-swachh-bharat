import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import { googleMapsSearchUrl } from "../components/SimpleMap";
import FacilityMap from "../components/FacilityMap";
import LocationCard from "../components/LocationCard";
import SearchBar from "../components/SearchBar";
import MapFilters from "../components/MapFilters";
import StatusFilterTabs from "../components/StatusFilterTabs";
import StatusBadge from "../components/StatusBadge";
import { useLiveBins } from "../hooks/useLiveBins";
import { useLiveToilets } from "../hooks/useLiveToilets";
import { useLiveLocation } from "../hooks/useLiveLocation";
import { useLiveBuildings } from "../hooks/useLiveBuildings";
import { useSyncStatus } from "../hooks/useSyncStatus";
import { TOILET_STATUS } from "../data/toilets";
import { BIN_STATUS } from "../data/bins";
import { FACILITY_PICK_LOCATIONS } from "../data/facilityRequests";
import IndiaLocationPicker from "../components/IndiaLocationPicker";
import { TAP_LINK } from "../components/buttonStyles";

// FIX — this screen previously rendered its map with SimpleMap, a plain
// OpenStreetMap iframe embed that can only ever show ONE fixed marker.
// That meant every bin/toilet except whatever was currently "selected"
// never appeared on the map itself — only in the list below it. Now
// backed by FacilityMap (react-leaflet), every bin/toilet in
// visibleBins/visibleToilets is plotted as its own colored pin, and
// tapping a pin selects it (same as tapping a row in the list below),
// which also still shows the LocationCard details panel above the map.
//
// GPS PREP NOTE (section 12 of the spec): bins/toilets are still plain
// { latitude, longitude } objects from src/data/bins.js and
// src/data/toilets.js. When live dustbin GPS is wired up in a later
// step, the natural home for that is alongside these fields — e.g.
// liveLatitude/liveLongitude/lastLocationUpdate/gpsAccuracy — without
// disturbing the demo latitude/longitude used here. Not implemented in
// this step.

// DEFAULT MAP CENTER — was hardcoded to Lucknow; changed to Meerut since
// that's where the IIMT-University-area demo/test facilities actually
// are (see FACILITY_PICK_LOCATIONS in data/facilityRequests.js), so the
// map opens centered on the same area those facilities are added to.
const DEFAULT_CENTER = { latitude: 29.8905551, longitude: 77.9601633 }; // COER University campus
const DEFAULT_CENTER_LABEL = "COER University";
const CAMPUS_ZOOM = 17;
const CITY_ZOOM = 13;
const SELECTED_ZOOM = 16;

// "Nearby" radius, in metres. Default is 500 m; "any" means no limit.
const RADIUS_OPTIONS = [
  { value: 200, label: "200 m" },
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: "any", label: "Any" },
];
const DEFAULT_RADIUS_M = 500;
// Zoom that frames a circle of the chosen radius in the map.
const RADIUS_ZOOM = { 200: 17, 500: 16, 1000: 15, 2000: 14, any: 13 };

function distanceMeters(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

const VALID_FILTERS = ["all", "buildings", "bins", "toilets"];

const BIN_STATUS_FILTERS = [
  { value: "all", label: "All Status" },
  { value: BIN_STATUS.NORMAL, label: "Normal" },
  { value: BIN_STATUS.ALMOST_FULL, label: "Almost Full" },
  { value: BIN_STATUS.OVERFLOW, label: "Overflow" },
];

const TOILET_STATUS_FILTERS = [
  { value: "all", label: "All Status" },
  { value: TOILET_STATUS.OPEN.toLowerCase(), label: "Open" },
  { value: TOILET_STATUS.CLOSED.toLowerCase(), label: "Closed" },
  { value: TOILET_STATUS.MAINTENANCE.toLowerCase(), label: "Maintenance" },
];

function NearbyRow({ kind, item, onSelect }) {
  const isBin = kind === "bin";
  const isBuilding = kind === "building";

  // USABILITY AUDIT FIX (issue 9 — "redundant sub-label"): the sub-label
  // often just repeated words already in the name (e.g. "Gomti Nagar
  // Park" above "Gomti Nagar"). Only show the area when it isn't a
  // substring of the name; otherwise fall back to a field that actually
  // adds information — waste type for bins, distance for toilets.
  const areaIsRedundant =
    item.area && item.name.toLowerCase().includes(item.area.toLowerCase());
  const subLabel = isBuilding
    ? item.typeLabel
    : areaIsRedundant
      ? (isBin ? item.type : item.distance) || item.area
      : item.area;
  // Avoid rendering distance twice when it was already used as the
  // fallback sub-label above.
  const showDistanceSuffix = item.distance && item.distance !== subLabel;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-3.5 py-3 text-left hover:bg-emerald-50"
    >
      <span className="text-lg">{isBin ? "🗑️" : isBuilding ? item.icon : "🚻"}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          {/* USABILITY AUDIT FIX (issues 3 & 4 — "text is truncated"): a
              single-line `truncate` could clip the whole facility name
              (e.g. "Dustbin near COER University gate") when the status
              badge claimed most of the row's width. Wrapping to 2 lines
              keeps the full name readable; `title` covers hover/AT. */}
          <span className="line-clamp-2 text-sm font-semibold text-emerald-950" title={item.name}>
            {item.name}
            {item.isDemo && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-bold text-amber-800">
                DEMO
              </span>
            )}
          </span>
          <StatusBadge status={item.status} className="shrink-0" />
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-emerald-800/50">
          <span className="truncate">{subLabel}</span>
          {showDistanceSuffix && (
            <>
              <span>·</span>
              <span>{item.distance}</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

export default function MapScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const bins = useLiveBins();
  const toilets = useLiveToilets();
  const buildings = useLiveBuildings();
  const sync = useSyncStatus();
  const [view, setView] = useState("map"); // "map" | "list"
  const [radiusTouched, setRadiusTouched] = useState(false);
  const {
    position,
    status: gpsStatus,
    error: gpsError,
    approximate: gpsApproximate,
    start,
    stop,
  } = useLiveLocation();
  const pendingCenterRef = useRef(false);
  const lastAccuracyRef = useRef(null);
  const manualRef = useRef(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);

  const initialFilter = searchParams.get("filter") ?? "all";
  const [filter, setFilter] = useState(
    VALID_FILTERS.includes(initialFilter) ? initialFilter : "all"
  );
  const [binStatusFilter, setBinStatusFilter] = useState("all");
  const [toiletStatusFilter, setToiletStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);
  const [selected, setSelected] = useState(null); // { kind: "bin"|"toilet"|"me", ... }
  // USABILITY AUDIT FIX (issue 6 — "wall of content"): both lists used to
  // render every match unconditionally, turning the map screen into a
  // long scroll that duplicated what the map above already shows
  // spatially. Cap each to a short preview with an explicit expand.
  const [showAllBins, setShowAllBins] = useState(false);
  const [showAllToilets, setShowAllToilets] = useState(false);
  const LIST_PREVIEW_COUNT = 3;

  // WRONG-LOCATION FIX: the first fix a browser hands back is usually
  // the coarse network guess, and the accurate GPS one lands a few
  // seconds later. Previously the map centred on that first guess and
  // then ignored every later fix, so a wrong city stayed on screen.
  // Now the map re-centres whenever a meaningfully more accurate fix
  // arrives — unless the citizen has overridden the area by hand.
  useEffect(() => {
    if (!position || manualRef.current) return;

    const improved =
      lastAccuracyRef.current == null || position.accuracy < lastAccuracyRef.current * 0.7;

    if (pendingCenterRef.current || improved) {
      setSelected({
        kind: "me",
        latitude: position.lat,
        longitude: position.lng,
        accuracy: position.accuracy,
        approximate: gpsApproximate,
      });
      lastAccuracyRef.current = position.accuracy;
      pendingCenterRef.current = false;
    }
  }, [position, gpsApproximate]);

  const handleUseMyLocation = () => {
    manualRef.current = false;
    lastAccuracyRef.current = null;
    pendingCenterRef.current = true;
    setShowAreaPicker(false);
    start(); // always a fresh, uncached fix — no stale city
  };

  const handlePickArea = (loc) => {
    stop(); // stop the GPS watch so a late fix can't overwrite the manual pick
    manualRef.current = true;
    lastAccuracyRef.current = null;
    pendingCenterRef.current = false;
    setShowAreaPicker(false);
    setSelected({
      kind: "me",
      latitude: loc.latitude,
      longitude: loc.longitude,
      manual: true,
      label: loc.address,
      // Picking a whole city/town (from the India-wide picker) should show
      // the city, not zoom to street level like a known locality does.
      zoom: loc.city ? CITY_ZOOM : SELECTED_ZOOM,
    });
  };

  // Reference point for "nearby": the area the citizen picked / their GPS
  // fix when there is one, otherwise the default map centre.
  const origin = useMemo(() => {
    if (selected?.kind === "me") return { latitude: selected.latitude, longitude: selected.longitude };
    if (position) return { latitude: position.lat, longitude: position.lng };
    return { latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude };
  }, [selected, position]);

  const withDistance = (items) =>
    items
      .map((item) => {
        if (typeof item.latitude !== "number" || typeof item.longitude !== "number") return null;
        const meters = distanceMeters(origin.latitude, origin.longitude, item.latitude, item.longitude);
        return { ...item, distanceMeters: meters, distance: formatDistance(meters) };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

  // Every bin/toilet (after the status filters) with its distance from the
  // origin, nearest first, before the distance limit is applied.
  const rankedBins = useMemo(
    () =>
      filter === "toilets"
        ? []
        : withDistance(bins.filter((b) => binStatusFilter === "all" || b.status === binStatusFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bins, filter, binStatusFilter, origin]
  );
  const rankedToilets = useMemo(
    () =>
      filter === "bins"
        ? []
        : withDistance(
            toilets.filter(
              (t) => toiletStatusFilter === "all" || t.status.toLowerCase() === toiletStatusFilter
            )
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toilets, filter, toiletStatusFilter, origin]
  );

  const inRange = (item) => radiusM === "any" || item.distanceMeters <= radiusM;
  const inRangeBins = rankedBins.filter(inRange);
  const inRangeToilets = rankedToilets.filter(inRange);

  // Nothing within the chosen distance (typically: "Use My Location" from
  // somewhere that isn't Roorkee). Rather than an empty map, fall back to
  // the nearest facilities and say so.
  const outOfRange =
    inRangeBins.length + inRangeToilets.length === 0 &&
    rankedBins.length + rankedToilets.length > 0;
  const visibleBins = outOfRange ? rankedBins : inRangeBins;
  const visibleToilets = outOfRange ? rankedToilets : inRangeToilets;
  const nearestFacility = outOfRange
    ? [...rankedBins, ...rankedToilets].sort((a, b) => a.distanceMeters - b.distanceMeters)[0]
    : null;

  const visibleBuildings = useMemo(
    () => (filter === "all" || filter === "buildings" ? withDistance(buildings) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildings, filter, origin]
  );

  const handleRadiusChange = (value) => {
    setRadiusM(value);
    setRadiusTouched(true);
    // Re-frame the map on the search point instead of leaving it on
    // whichever bin/toilet was tapped last.
    setSelected((cur) => (cur && cur.kind !== "me" ? null : cur));
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const binResults = visibleBins
      .filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q) ||
          b.area.toLowerCase().includes(q) ||
          b.address.toLowerCase().includes(q)
      )
      .map((b) => ({ kind: "bin", ...b }));

    const toiletResults = visibleToilets
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.area.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q)
      )
      .map((t) => ({ kind: "toilet", ...t }));

    const buildingResults = visibleBuildings
      .filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q) ||
          b.typeLabel.toLowerCase().includes(q) ||
          b.address.toLowerCase().includes(q)
      )
      .map((b) => ({ kind: "building", ...b }));

    return [...buildingResults, ...binResults, ...toiletResults].slice(0, 8);
  }, [query, visibleBins, visibleToilets, visibleBuildings]);

  const handleSelectResult = (result) => {
    setSelected(result);
    setQuery("");
  };

  const handleViewDetails = (id) => {
    if (selected?.kind === "bin") {
      navigate(`/citizen/bin/${id}`, { state: { bin: selected } });
    } else if (selected?.kind === "toilet") {
      navigate(`/citizen/toilet/${id}`, { state: { toilet: selected } });
    }
  };

  const mapCenter =
    selected && selected.kind !== "me"
      ? { latitude: selected.latitude, longitude: selected.longitude, zoom: SELECTED_ZOOM }
      : nearestFacility
        ? { latitude: nearestFacility.latitude, longitude: nearestFacility.longitude, zoom: CITY_ZOOM + 1 }
        : {
            latitude: origin.latitude,
            longitude: origin.longitude,
            zoom:
              selected?.zoom === CITY_ZOOM
                ? CITY_ZOOM
                : radiusTouched
                  ? RADIUS_ZOOM[radiusM] ?? CITY_ZOOM
                  : CAMPUS_ZOOM,
          };

  return (
    <CitizenShell noScroll>
      {/* USABILITY AUDIT FIX (issue 7 — header alignment/spacing): the
          title relied on flex-1 for layout but had no text-align, and its
          two flanking elements were asymmetric (a fixed 36px back button
          vs. nothing on the right), so it visually drifted off-center. A
          matching w-9 spacer on the right — mirroring the back button —
          keeps the centered title balanced.
          pb-3 → pb-4 also opens up the cramped gap before the search
          bar below (the scroll container has no top padding of its
          own). */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-emerald-950">Bin &amp; Toilet Map</h1>
        <div className="h-9 w-9" aria-hidden="true" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
        <div className="flex flex-col gap-3">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search bin, toilet, area or address..."
          />

          {searchResults.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-lg">
              {searchResults.map((result) => (
                <button
                  key={`${result.kind}-${result.id}`}
                  type="button"
                  onClick={() => handleSelectResult(result)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-emerald-50"
                >
                  <span className="text-base">
                    {result.kind === "bin" ? "🗑️" : result.kind === "toilet" ? "🚻" : result.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-emerald-950">
                      {result.name}
                    </span>
                    <span className="block truncate text-xs text-emerald-800/50">
                      {result.id} · {result.area}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {sync.error && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700 shadow-sm">
              <span>{sync.error.message}</span>
              <button type="button" onClick={sync.retry} className="shrink-0 rounded-full bg-white px-3 py-1 font-semibold text-red-700 shadow-sm">
                Retry
              </button>
            </div>
          )}

          <div className="inline-flex w-fit rounded-full bg-white p-1 shadow-md shadow-emerald-900/10" role="tablist" aria-label="Map or list view">
            {[
              ["map", "Map"],
              ["list", "List"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                  view === id ? "bg-emerald-700 text-white" : "text-emerald-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MapFilters value={filter} onChange={setFilter} className="w-fit" />
            <button
              type="button"
              onClick={handleUseMyLocation}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-md"
            >
              {gpsStatus === "locating" ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12a9 9 0 11-9-9" />
                </svg>
              ) : (
                "📍"
              )}
              Use My Location
            </button>
            <button
              type="button"
              onClick={() => setShowAreaPicker((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-md"
            >
              Set area manually
            </button>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-emerald-950">
              Show bins &amp; toilets within
            </p>
            <StatusFilterTabs
              options={RADIUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={radiusM}
              onChange={handleRadiusChange}
            />
          </div>

          {outOfRange && nearestFacility && (
            <p className="rounded-2xl bg-white px-3 py-2 text-xs font-medium text-emerald-800/70 shadow-sm">
              Nothing within {RADIUS_OPTIONS.find((o) => o.value === radiusM)?.label} of this point — the
              nearest {nearestFacility.type ? "bin" : "toilet"} is {nearestFacility.distance} away. Showing the
              closest ones instead.
            </p>
          )}

          {filter === "bins" && (
            <StatusFilterTabs options={BIN_STATUS_FILTERS} value={binStatusFilter} onChange={setBinStatusFilter} />
          )}
          {filter === "toilets" && (
            <StatusFilterTabs options={TOILET_STATUS_FILTERS} value={toiletStatusFilter} onChange={setToiletStatusFilter} />
          )}

          {gpsError && (
            <p className="rounded-2xl bg-white px-3 py-2 text-xs font-medium text-emerald-800/70 shadow-sm">
              {gpsError}
            </p>
          )}

          {gpsStatus === "locating" && (
            <p className="rounded-2xl bg-white px-3 py-2 text-xs font-medium text-emerald-800/70 shadow-sm">
              Getting a GPS fix… the first reading may be a rough network guess and will sharpen in a few
              seconds.
            </p>
          )}

          {showAreaPicker && (
            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
              <p className="mb-2 text-xs font-semibold text-emerald-950">Set your area manually</p>
              <IndiaLocationPicker
                id="map-area"
                value={null}
                onChange={(loc) => loc && handlePickArea(loc)}
                presets={FACILITY_PICK_LOCATIONS}
                presetsLabel="Known areas"
                allowLocality={false}
                allowGps={false}
              />
            </div>
          )}

          {view === "map" && (
            <>
          <FacilityMap
            bins={visibleBins}
            toilets={visibleToilets}
            center={{ latitude: mapCenter.latitude, longitude: mapCenter.longitude }}
            zoom={mapCenter.zoom}
            selectedKind={
              selected?.kind === "me" ? null : selected?.kind === "building" ? "marker" : selected?.kind ?? null
            }
            selectedId={selected?.kind === "me" ? null : selected?.id ?? null}
            userLocation={selected?.kind === "me" ? selected : position ? { latitude: position.lat, longitude: position.lng } : null}
            markers={visibleBuildings.map((b) => ({
              id: b.id,
              latitude: b.latitude,
              longitude: b.longitude,
              name: b.name,
              color: b.isDemo ? "#7c3aed" : "#0f766e",
              glyph: b.icon,
              popup: b,
            }))}
            onSelectMarker={(m) => {
              const building = visibleBuildings.find((b) => b.id === m.id);
              if (building) setSelected({ kind: "building", ...building });
            }}
            radiusCircle={
              radiusTouched && !outOfRange && radiusM !== "any" && !(selected && selected.kind !== "me")
                ? { latitude: origin.latitude, longitude: origin.longitude, radius: radiusM }
                : null
            }
            onSelectBin={(bin) => setSelected({ kind: "bin", ...bin })}
            onSelectToilet={(toilet) => setSelected({ kind: "toilet", ...toilet })}
            // USABILITY AUDIT FIX (issue 5 round 1 / issue 2 round 2 — map
            // still under a third of the screen): the first pass (42vh)
            // wasn't enough once real mobile browser chrome (address bar,
            // etc.) is accounted for. Raising the floor and ceiling here
            // gives the map — the page's actual reason for existing —
            // roughly half the viewport on a typical phone.
            className="h-[52vh] min-h-80 max-h-[480px]"
          />

          {/* USABILITY AUDIT FIX (issue 5 — map-provider link stranded far
              below the map it refers to): this used to sit at the very
              bottom of the page, past both facility lists. Right under
              the map — where its own attribution line already is — is
              where a "switch map providers" link is actually expected. */}
          <a
            href={googleMapsSearchUrl(mapCenter.latitude, mapCenter.longitude)}
            target="_blank"
            rel="noreferrer"
            className="-mt-1 self-end text-xs font-semibold text-emerald-700 underline"
          >
            Open this area in Google Maps
          </a>
            </>
          )}

          {selected && (
            <LocationCard
              kind={selected.kind}
              item={selected}
              onViewDetails={handleViewDetails}
              onRetryLocation={selected.kind === "me" ? handleUseMyLocation : undefined}
              onSetManually={selected.kind === "me" ? () => setShowAreaPicker((v) => !v) : undefined}
            />
          )}

          {!selected && (
            <p className="rounded-2xl bg-white px-4 py-3 text-xs text-emerald-800/60 shadow-sm">
              Showing {DEFAULT_CENTER_LABEL}. Search, or pick a bin/toilet from the list below, to see its exact
              location and open it in Google Maps.
            </p>
          )}

          {(filter === "all" || filter === "buildings") && visibleBuildings.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-emerald-950">Campus Buildings</h2>
              <div className="flex flex-col gap-2">
                {(view === "list" || filter === "buildings" ? visibleBuildings : visibleBuildings.slice(0, LIST_PREVIEW_COUNT)).map((b) => (
                  <NearbyRow
                    key={b.id}
                    kind="building"
                    item={b}
                    onSelect={() => {
                      setSelected({ kind: "building", ...b });
                      setView("map");
                    }}
                  />
                ))}
              </div>
              {view === "map" && filter === "all" && visibleBuildings.length > LIST_PREVIEW_COUNT && (
                <button type="button" onClick={() => setFilter("buildings")} className={`mt-2 self-start ${TAP_LINK}`}>
                  View all {visibleBuildings.length}
                </button>
              )}
            </div>
          )}

          {filter !== "toilets" && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-emerald-950">Nearby Dustbins</h2>
              <div className="flex flex-col gap-2">
                {visibleBins.length === 0 && (
                  <p className="text-xs text-emerald-800/50">{sync.loaded ? "No bins within this distance — try a larger range." : "Loading bins…"}</p>
                )}
                {(showAllBins || view === "list" ? visibleBins : visibleBins.slice(0, LIST_PREVIEW_COUNT)).map((bin) => (
                  <NearbyRow
                    key={bin.id}
                    kind="bin"
                    item={bin}
                    onSelect={() => {
                      setSelected({ kind: "bin", ...bin });
                      setView("map");
                    }}
                  />
                ))}
                {visibleBins.length > LIST_PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllBins((v) => !v)}
                    className={`self-start ${TAP_LINK}`}
                  >
                    {showAllBins ? "Show less" : `View all ${visibleBins.length}`}
                  </button>
                )}
              </div>
            </div>
          )}

          {filter !== "bins" && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-emerald-950">Nearby Public Toilets</h2>
              <div className="flex flex-col gap-2">
                {visibleToilets.length === 0 && (
                  <p className="text-xs text-emerald-800/50">{sync.loaded ? "No toilets within this distance — try a larger range." : "Loading toilets…"}</p>
                )}
                {(showAllToilets || view === "list" ? visibleToilets : visibleToilets.slice(0, LIST_PREVIEW_COUNT)).map(
                  (toilet) => (
                    <NearbyRow
                      key={toilet.id}
                      kind="toilet"
                      item={toilet}
                      onSelect={() => {
                        setSelected({ kind: "toilet", ...toilet });
                        setView("map");
                      }}
                    />
                  )
                )}
                {visibleToilets.length > LIST_PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllToilets((v) => !v)}
                    className={`self-start ${TAP_LINK}`}
                  >
                    {showAllToilets ? "Show less" : `View all ${visibleToilets.length}`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </CitizenShell>
  );
}
