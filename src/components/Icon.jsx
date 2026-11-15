// The app's one icon set: 24px outline icons, stroke 2, round caps (the
// Lucide visual language). No emoji anywhere on screen: data that still holds
// an emoji (complaint types, building kinds, the eco guide) is drawn through
// <Glyph>, which maps it to one of these.

const PATHS = {
  bin: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  toilet: (
    <>
      <path d="M7 3h4v7H7z" />
      <path d="M4 10h16a7 7 0 01-7 7h-2a7 7 0 01-7-7z" />
      <path d="M9 17l-1 4h8l-1-4" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v10H3z" />
      <path d="M14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  recycle: (
    <>
      <path d="M7 19H4.8a1.8 1.8 0 01-1.6-2.7L5.5 12" />
      <path d="M11 19h8.2a1.8 1.8 0 001.6-2.7l-1.2-2.1" />
      <path d="M14 16l-3 3 3 3" />
      <path d="M8.3 7.4L10.4 4a1.8 1.8 0 013.1 0l3 5" />
      <path d="M13.4 9.5L16.5 9l.6-3.2" />
      <path d="M5.5 12L4.3 9l3.3-.8" />
    </>
  ),
  check: <path d="M5 12l5 5L20 7" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5" />
      <path d="M12 17h.01" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </>
  ),
  leaf: (
    <>
      <path d="M11 20A7 7 0 014 13c0-6 7-9 16-10-1 9-4 16-10 16" />
      <path d="M4 20c4-4 7-6 10-8" />
    </>
  ),
  tree: (
    <>
      <path d="M12 21v-6" />
      <path d="M12 3l6 8h-3l4 5H5l4-5H6z" />
    </>
  ),
  utensils: (
    <>
      <path d="M6 3v7a2 2 0 002 2v9" />
      <path d="M10 3v7a2 2 0 01-2 2" />
      <path d="M17 21V3c-2 1-3 4-3 7s1 4 3 4" />
    </>
  ),
  graduation: (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11v5c3 2 9 2 12 0v-5" />
      <path d="M22 9v6" />
    </>
  ),
  landmark: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V10M9 21V10M15 21V10M19 21V10" />
      <path d="M2 10l10-6 10 6z" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M11 21v-3h2v3" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z" />
    </>
  ),
  droplet: <path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" />,
  message: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  clipboard: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" />
      <path d="M4 19V5" />
      <path d="M8 7h7" />
    </>
  ),
  note: (
    <>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8M8 17h5" />
    </>
  ),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />,
  megaphone: (
    <>
      <path d="M3 10v4h4l9 5V5L7 10z" />
      <path d="M19 9a4 4 0 010 6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  map: (
    <>
      <path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z" />
      <path d="M9 7v13M15 4v13" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.6-4 5-6 8-6s6.4 2 8 6" />
    </>
  ),
  door: (
    <>
      <path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17" />
      <path d="M3 21h18" />
      <path d="M14 12h.01" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 13H6z" />
      <path d="M9 8a3 3 0 016 0" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18V7M21 18v-5a3 3 0 00-3-3h-8v8" />
      <path d="M3 14h18" />
      <circle cx="6.5" cy="10.5" r="1.5" />
    </>
  ),
  toolbox: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M9 8V5h6v3" />
      <path d="M3 13h18" />
    </>
  ),
  broom: (
    <>
      <path d="M19 3l-7 7" />
      <path d="M8 10l6 6-3 5H4a1 1 0 01-1-1l2-6z" />
      <path d="M7 16l-2 3" />
    </>
  ),
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  inbox: (
    <>
      <path d="M3 13l3-8h12l3 8" />
      <path d="M3 13v6h18v-6h-5l-1.5 2h-5L8 13z" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.3L2.7 18.7A1 1 0 003.6 20h16.8a1 1 0 00.9-1.3L13.7 4.3a1 1 0 00-1.7 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  home: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  reports: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M10 12h5M10 16h5" />
    </>
  ),
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </>
  ),
};

/** An outline icon by name. Decorative by default; pass `label` when it carries meaning on its own. */
export default function Icon({ name, className = "h-5 w-5", label, strokeWidth = 2 }) {
  const paths = PATHS[name] ?? PATHS.info;
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {paths}
    </svg>
  );
}

