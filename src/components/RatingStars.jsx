// Five stars showing an average (rounded to the nearest whole star). The
// number is always shown next to it as text, so the stars are decorative.
const STAR = "M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z";

export function StarIcon({ filled = true, className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 20 20" className={`${className} ${filled ? "fill-amber-400" : "fill-emerald-100"}`} aria-hidden="true">
      <path d={STAR} />
    </svg>
  );
}

export default function RatingStars({ value, className = "h-4 w-4" }) {
  const whole = Math.round(value ?? 0);
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} filled={i <= whole} className={className} />
      ))}
    </span>
  );
}
