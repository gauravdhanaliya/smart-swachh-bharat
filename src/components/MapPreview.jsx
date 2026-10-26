import { useNavigate } from "react-router-dom";
import FacilityMap from "./FacilityMap";

const DEFAULT_CENTER = { latitude: 26.8467, longitude: 80.9462 };

function LegendShape({ round }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 bg-emerald-700 ${round ? "rounded-full" : "rounded-[3px]"}`}
    />
  );
}

export default function MapPreview({ bins = [], toilets = [], center = DEFAULT_CENTER, fill = false }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/citizen/map")}
      aria-label={`Open full map — ${bins.length} bins and ${toilets.length} toilets nearby`}
      className="relative block w-full overflow-hidden rounded-2xl border border-emerald-100 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      style={fill ? { height: "100%", minHeight: 70 } : { height: 160 }}
    >
      <FacilityMap
        bins={bins}
        toilets={toilets}
        center={center}
        zoom={12}
        interactive={false}
        compact
        className="h-full w-full"
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-emerald-900 backdrop-blur-sm">
        <span className="flex items-center gap-1">
          <LegendShape round={false} />
          {bins.length} bins
        </span>
        <span className="flex items-center gap-1">
          <LegendShape round />
          {toilets.length} toilets
        </span>
      </span>
    </button>
  );
}