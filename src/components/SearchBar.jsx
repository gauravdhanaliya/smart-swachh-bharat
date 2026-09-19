export default function SearchBar({
  value,
  onChange,
  placeholder = "Search bins, toilets, areas...",
  onFocus,
  className = "",
}) {
  return (
    // USABILITY AUDIT FIX (issue 10 — search input lacks affordance):
    // border-emerald-100 is a near-white tint and shadow-sm is very
    // subtle, so against the page's own pale gradient background this
    // read as a divider rather than a tappable field. Raising the
    // border contrast and matching the shadow-md already used by the
    // filter pills right below it gives it real elevation.
    <div
      className={`flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-white px-4 py-3.5 shadow-md ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0 text-emerald-600"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-emerald-950 placeholder:text-emerald-800/40 outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="text-emerald-800/40 hover:text-emerald-700"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
