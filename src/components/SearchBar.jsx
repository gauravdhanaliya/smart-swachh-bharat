/**
 * Search field. With `onSubmit` it is a form with a Search button: typing only
 * calls `onChange` (local filtering); Search or Enter calls `onSubmit` — the
 * only moment anything is looked up online.
 */
export default function SearchBar({
  value,
  onChange,
  onSubmit,
  submitting = false,
  placeholder = "Search bins, toilets, areas...",
  label = "Search",
  onFocus,
  className = "",
}) {
  const field = (
    <>
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0 text-emerald-600"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        type="search"
        enterKeyHint="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-emerald-950 placeholder:text-emerald-800/40 outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-800/50 hover:text-emerald-700"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </>
  );

  // USABILITY AUDIT FIX (issue 10 — search input lacks affordance): a
  // stronger border and shadow-md so the field reads as tappable against the
  // page's pale background.
  const shell = `flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-white px-4 py-2.5 shadow-md focus-within:ring-2 focus-within:ring-emerald-500 ${className}`;

  if (!onSubmit) return <div className={shell}>{field}</div>;

  return (
    <form
      role="search"
      className={shell}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      {field}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-9 shrink-0 cursor-pointer rounded-full bg-emerald-700 px-4 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? "Searching…" : "Search"}
      </button>
    </form>
  );
}
