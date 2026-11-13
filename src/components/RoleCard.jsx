const ICONS = {
  citizen: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.6-4 5-6 8-6s6.4 2 8 6" />
    </svg>
  ),
  official: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V9l7-5 7 5v12" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  worker: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l3-7 3 2 3-2 3 7" />
      <circle cx="12" cy="6" r="3" />
      <path d="M9 20h6" />
    </svg>
  ),
};

const ICON_THEME = {
  citizen: "bg-emerald-500 text-white",
  official: "bg-sky-500 text-white",
  worker: "bg-orange-500 text-white",
};

/** A tappable role on the login screen: tapping it signs in as that role. */
export default function RoleCard({ id, title, description, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className="group flex w-full items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-3.5 py-2.5 text-left shadow-[0_6px_20px_-12px_rgba(15,110,58,0.35)] transition hover:border-emerald-300 hover:bg-emerald-50/60 hover:shadow-[0_10px_24px_-12px_rgba(15,110,58,0.45)] active:scale-[0.98] active:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_THEME[id]}`} aria-hidden="true">
        {ICONS[id]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-emerald-950">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-emerald-800/70">{description}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-emerald-500 transition group-hover:translate-x-0.5 group-hover:text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    </button>
  );
}
