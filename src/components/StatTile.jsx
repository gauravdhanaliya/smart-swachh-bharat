import { CARD_BUTTON } from "./buttonStyles";

const ICON_BG = {
  emerald: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
  red: "bg-red-100 text-red-700",
  sky: "bg-sky-100 text-sky-700",
  slate: "bg-slate-200 text-slate-700",
};

// Non-interactive tiles keep the plain card look: no hover, no chevron.
const STATIC_CARD =
  "flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white p-3.5 text-left shadow-sm";

export default function StatTile({ icon, label, value, color = "emerald", onClick }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      type={onClick ? "button" : undefined}
      className={onClick ? CARD_BUTTON : STATIC_CARD}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_BG[color]}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold leading-tight text-emerald-950">{value}</span>
        <span className="block text-xs leading-tight text-emerald-800/60">{label}</span>
      </span>
      {/* USABILITY AUDIT FIX (round 2, issue 4 — unclear which cards are
          interactive): "Total Bins Nearby" and the "Small Actions" banner
          both end in an arrow/chevron, but the tiles that are just as
          tappable had nothing. A trailing chevron is rendered only when
          the tile actually has an onClick, so it stays an honest signal
          — decorative for assistive tech (the tile's text is its name). */}
      {onClick && (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-emerald-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </Comp>
  );
}
