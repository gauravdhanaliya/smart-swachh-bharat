import { StarIcon } from "./RatingStars";
import { formatAverage, ratingCountLabel } from "../utils/ratings";

/** "★ 4.5 · 2 ratings", or "No ratings yet". Compact, for lists and map popups. */
export default function RatingBadge({ summary, className = "" }) {
  const count = summary?.count ?? 0;
  if (!count) return <span className={`text-xs text-emerald-800/50 ${className}`}>No ratings yet</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium text-emerald-900 ${className}`}>
      <StarIcon className="h-3.5 w-3.5" />
      <span>{`${formatAverage(summary.average)} · ${ratingCountLabel(count)}`}</span>
    </span>
  );
}
