import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import FacilityMap from "./FacilityMap";
import Icon from "./Icon";

// The Home's small map. It fits every bin and toilet in view with padding
// (no pin clipped at an edge), draws bins green and toilets blue, and puts
// the legend BELOW the map, so nothing covers a pin. Tapping it opens the
// full map. When there is nothing it could pin, a counts card replaces it,
// never a bare map.
const PIN_COLORS = { bin: "#0b7a4b", toilet: "#2563eb" };
export const PIN_PADDING = 28; // px kept clear on every side of the map

function LegendDot({ kind }) {
  // Same shapes as the pins: round bins, square toilets.
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 ${kind === "bin" ? "rounded-full bg-brand" : "rounded-[3px] bg-blue-600"}`} />;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const hasPosition = (p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude);

// `center` is the chosen city's centre (used only when there's nothing to frame).
// `fill` makes the preview take its parent's height (the one-screen Home).
export default function MapPreview({ bins = [], toilets = [], center, fill = false }) {
  const navigate = useNavigate();
  const points = useMemo(() => [...bins, ...toilets].filter(hasPosition), [bins, toilets]);
  const label = `Open the full map: ${plural(bins.length, "bin", "bins")} and ${plural(toilets.length, "toilet", "toilets")}`;
  const size = fill ? { height: "100%", minHeight: 96 } : { height: 160 };

  if (!points.length) {
    return (
      <button
        type="button"
        onClick={() => navigate("/citizen/map")}
        aria-label={label}
        data-map-counts
        className="flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-line bg-section p-4 text-left hover:bg-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        style={size}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-brand" aria-hidden="true">
          <Icon name="map" className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-ink">0 bins · 0 toilets</span>
          <span className="block text-sm text-muted">None mapped here yet. Open the map to look around.</span>
        </span>
        <Icon name="chevronRight" className="h-5 w-5 text-muted" />
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col" data-map-preview>
      <button
        type="button"
        onClick={() => navigate("/citizen/map")}
        aria-label={label}
        className="relative block min-h-0 w-full flex-1 cursor-pointer overflow-hidden rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        style={size}
      >
        <FacilityMap
          bins={bins}
          toilets={toilets}
          center={center}
          fitTo={points}
          fitPadding={PIN_PADDING}
          interactive={false}
          compact
          cluster={false}
          pinColors={PIN_COLORS}
          className="h-full w-full rounded-none border-0"
        />
      </button>
      <p data-map-legend className="mt-2 flex shrink-0 items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <LegendDot kind="bin" />
          {plural(bins.length, "bin", "bins")}
        </span>
        <span className="flex items-center gap-1.5">
          <LegendDot kind="toilet" />
          {plural(toilets.length, "toilet", "toilets")}
        </span>
      </p>
    </div>
  );
}
