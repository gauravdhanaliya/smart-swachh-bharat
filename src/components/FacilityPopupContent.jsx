import { formatAverage, ratingCountLabel } from "../utils/ratings";

const STATUS_LABELS = { normal: "Normal", almost_full: "Almost full", overflow: "Overflow" };
const KIND_LABELS = { bin: "Dustbin", toilet: "Public toilet" };

/**
 * What a map popup shows: name, type, coordinates, status, a toilet's rating,
 * and a DEMO tag for simulated locations. With `onReport` (citizens), bins and
 * toilets also get a "Report an issue" button.
 */
export default function FacilityPopupContent({ item, kind, rating, onReport }) {
  const typeLabel = item.typeLabel ?? KIND_LABELS[kind] ?? "Location";
  const status = STATUS_LABELS[item.status] ?? item.status;
  const canReport = onReport && (kind === "bin" || kind === "toilet");
  return (
    <div style={{ minWidth: 170, fontSize: 12, lineHeight: 1.45 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.name}</div>
      <div>{typeLabel}</div>
      <div>
        {Number(item.latitude).toFixed(6)}, {Number(item.longitude).toFixed(6)}
      </div>
      {status && <div>Status: {status}</div>}
      {kind === "toilet" && (
        <div>Rating: {rating?.count ? `${formatAverage(rating.average)} / 5 (${ratingCountLabel(rating.count)})` : "No ratings yet"}</div>
      )}
      {item.isDemo && <div style={{ marginTop: 4, fontWeight: 700, color: "#92400e" }}>DEMO — simulated location</div>}
      {canReport && (
        <button
          type="button"
          onClick={() => onReport(kind, item)}
          className="mt-2 min-h-9 w-full cursor-pointer rounded-full bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
        >
          Report an issue
        </button>
      )}
    </div>
  );
}
