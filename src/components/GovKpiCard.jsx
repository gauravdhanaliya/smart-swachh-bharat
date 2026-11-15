import Icon from "./Icon";

// Status colour lives only in a small dot beside the label (never a big
// coloured circle, never a red zero). `tone` names the status it stands for.
const TONE_DOT = {
  neutral: null,
  new: "bg-brand",
  progress: "bg-amber-500",
  done: "bg-green-600",
  alert: "bg-red-600",
};

/**
 * One compact stat tile (Government dashboard): a neutral icon tile, the
 * number, and the label with a small status dot. White, 1px border, no shadow.
 * `wide` spans both columns on a phone (an odd last tile leaves no gap).
 */
export default function GovKpiCard({ icon, label, value, sublabel, tone = "neutral", onClick, wide = false, dense = false }) {
  const Comp = onClick ? "button" : "div";
  const dot = TONE_DOT[tone];
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-kpi-card
      className={`flex items-center rounded-2xl border border-line bg-white text-left ${dense ? "min-h-12 gap-2.5 px-3 py-2" : "min-h-16 gap-3 p-3"} ${onClick ? "cursor-pointer hover:bg-section" : ""} ${wide ? "col-span-2 sm:col-span-1" : ""}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-xl bg-section text-ink ${dense ? "h-8 w-8" : "h-10 w-10"}`} aria-hidden="true">
        <Icon name={icon} className={dense ? "h-4 w-4" : "h-5 w-5"} />
      </span>
      <span className="min-w-0">
        {/* The sublabel ("of 12 tracked") rides on the number's line: every tile stays two lines tall. */}
        <span className="flex items-baseline gap-1">
          <span className={`${dense ? "text-lg" : "text-xl"} leading-tight font-semibold text-ink tabular-nums`}>{value}</span>
          {sublabel && <span className="truncate text-xs text-muted">{sublabel}</span>}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />}
          <span className="truncate">{label}</span>
        </span>
      </span>
    </Comp>
  );
}
