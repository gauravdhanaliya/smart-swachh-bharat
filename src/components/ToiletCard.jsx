import StatusBadge from "./StatusBadge";

export default function ToiletCard({ toilet, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200"
    >
      <span className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-50 text-lg">
          🚻
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-semibold text-emerald-950">{toilet.name}</span>
              <span className="block text-xs text-emerald-800/60">{toilet.id}</span>
            </span>
            <StatusBadge status={toilet.status} className="shrink-0" />
          </span>

          <span className="mt-2 flex items-center gap-3 text-xs text-emerald-800/70">
            <span className="flex items-center gap-1">
              <StarRating value={toilet.cleanliness} />
            </span>
            <span>{toilet.distance}</span>
          </span>

          <span className="mt-1 block text-xs text-emerald-800/50">
            {toilet.address} · Updated {toilet.lastUpdated}
          </span>
        </span>
      </span>
    </button>
  );
}

function StarRating({ value }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 ${i < value ? "fill-orange-400" : "fill-emerald-100"}`}
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}
