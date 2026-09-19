import { PILL_ACTIVE, PILL_INACTIVE } from "./buttonStyles";

const OPTIONS = [
  { id: "all", label: "All" },
  { id: "bins", label: "Bins" },
  { id: "toilets", label: "Toilets" },
];

export default function MapFilters({ value, onChange, className = "" }) {
  return (
    // USABILITY AUDIT FIX (issue 6 — jagged alignment): this wrapper's
    // own p-1 (the padding that gives the segmented-control "track" its
    // inset look) pushed the "All" button's rendered left edge 4px to
    // the right of every sibling at this indent level ("Set area
    // manually", the "Nearby Dustbins" heading). -ml-1 cancels exactly
    // that padding so the visible edge lines back up, without losing
    // the track padding itself.
    <div
      className={`-ml-1 inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-md shadow-emerald-900/10 ${className}`}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          // USABILITY AUDIT FIX (issue 1, round 2): this row previously
          // hand-rolled its own active/inactive pair, distinct from the
          // near-identical pair StatusFilterTabs already defines a few
          // lines away for the exact same "selected chip" pattern.
          className={value === option.id ? PILL_ACTIVE : PILL_INACTIVE}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
