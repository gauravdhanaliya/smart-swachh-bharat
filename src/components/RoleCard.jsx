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

const THEME = {
  citizen: { bg: "bg-emerald-50", ring: "ring-emerald-500", icon: "bg-emerald-500 text-white" },
  official: { bg: "bg-sky-50", ring: "ring-sky-500", icon: "bg-sky-500 text-white" },
  worker: { bg: "bg-orange-50", ring: "ring-orange-500", icon: "bg-orange-500 text-white" },
};

export default function RoleCard({ id, title, description, selected, onSelect }) {
  const theme = THEME[id];
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`w-full flex items-start gap-4 rounded-2xl border p-4 text-left transition ${theme.bg} ${
        selected
          ? `ring-2 ${theme.ring} border-transparent`
          : "border-emerald-100 hover:border-emerald-200"
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${theme.icon}`}>
        {ICONS[id]}
      </span>
      <span className="flex-1">
        <span className="block font-semibold text-emerald-950">{title}</span>
        <span className="block text-sm text-emerald-800/70 mt-0.5">{description}</span>
      </span>
      <span
        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-emerald-600 bg-emerald-600" : "border-emerald-200"
        }`}
      >
        {selected && (
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
    </button>
  );
}
