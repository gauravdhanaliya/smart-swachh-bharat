const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const GovNavIcons = {
  dashboard: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  complaints: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M7 3h10l4 4v14H7V3z" />
      <path d="M10 12h6M10 16h6M10 8h3" />
    </svg>
  ),
  bins: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M6 7h12l-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7z" />
      <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M4 7h16" />
    </svg>
  ),
  toilets: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M7 21V9a4 4 0 118 0v12" />
      <path d="M4 21h16M9 9h6" />
    </svg>
  ),
  workers: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M3.5 20c1-3.6 3.2-5.6 5.5-5.6s4.5 2 5.5 5.6" />
      <path d="M15 15.4c2 .3 3.5 2 4.2 4.6" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M2 20h20" />
    </svg>
  ),
  notifications: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z" />
      <path d="M9.5 18a2.5 2.5 0 005 0" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.6-4 5-6 8-6s6.4 2 8 6" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...common}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  facilityRequests: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M9 3h6l1 3h3v3H5V6h3l1-3z" />
      <path d="M5 9v10a2 2 0 002 2h10a2 2 0 002-2V9" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  ),
};
