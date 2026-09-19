import { useNavigate } from "react-router-dom";
import FacilityMap from "./FacilityMap";

// FIX — this home-screen preview previously rendered with SimpleMap (a
// non-interactive OpenStreetMap iframe) and silently ignored the
// `bins`/`toilets` it was passed, since a plain iframe can't carry
// custom pins. Now backed by FacilityMap (react-leaflet), it actually
// plots the real bins/toilets, same data as the full map.
//
// USABILITY AUDIT FIX (round 2, issue 3 — cluttered emoji markers): at
// this size (160px tall, whole-city zoom) full-size pins can only ever
// pile on top of each other. The preview now asks FacilityMap for its
// `compact` rendering — small status dots, nearby ones merged into count
// badges — and a legend chip states the totals in plain text so the
// picture never has to be counted by eye. The full-size, tappable pins
// live on the full map, one tap away.
const DEFAULT_CENTER = { latitude: 26.8467, longitude: 80.9462 };

function LegendShape({ round }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 bg-emerald-700 ${round ? "rounded-full" : "rounded-[3px]"}`}
    />
  );
}

// `center` follows the citizen's chosen city (see CitySelector).
export default function MapPreview({ bins = [], toilets = [], center = DEFAULT_CENTER }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/citizen/map")}
      aria-label={`Open full map — ${bins.length} bins and ${toilets.length} toilets nearby`}
      className="relative block w-full overflow-hidden rounded-2xl border border-emerald-100 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      style={{ height: 160 }}
    >
      <FacilityMap
        bins={bins}
        toilets={toilets}
        center={center}
        zoom={12}
        interactive={false}
        compact
        className="h-full"
      />

      <span className="pointer-events-none absolute inset-0 bg-emerald-950/0 transition group-hover:bg-emerald-950/5" />
      <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-900 shadow">
        <LegendShape round />
        {bins.length} {bins.length === 1 ? "bin" : "bins"}
        <LegendShape />
        {toilets.length} {toilets.length === 1 ? "toilet" : "toilets"}
      </span>
      <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow">
        Open Map →
      </span>
    </button>
  );
}
