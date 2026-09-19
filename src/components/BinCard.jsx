import StatusBadge from "./StatusBadge";

const FILL_BAR_COLOR = {
  normal: "bg-emerald-500",
  almost_full: "bg-orange-500",
  overflow: "bg-red-500",
};

export default function BinCard({ bin, onClick, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 ${
        compact ? "flex items-center gap-3" : ""
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-lg">
        🗑️
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-semibold text-emerald-950">{bin.name}</span>
            <span className="block text-xs text-emerald-800/60">
              {bin.id} · {bin.type}
            </span>
          </span>
          <StatusBadge status={bin.status} className="shrink-0" />
        </span>

        <span className="mt-2 block">
          <span className="flex items-center justify-between text-xs text-emerald-800/70">
            <span>Fill Level</span>
            <span className="font-semibold">{bin.fillLevel}%</span>
          </span>
          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-emerald-50">
            <span
              className={`block h-full rounded-full ${FILL_BAR_COLOR[bin.status]}`}
              style={{ width: `${bin.fillLevel}%` }}
            />
          </span>
        </span>

        {!compact && (
          <span className="mt-2 block text-xs text-emerald-800/50">
            {bin.address} · Updated {bin.lastUpdated}
          </span>
        )}
      </span>
    </button>
  );
}
