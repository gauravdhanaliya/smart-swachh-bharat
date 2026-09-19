import { useLocation, useNavigate } from "react-router-dom";

const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v9h14v-9" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M7 3h10l4 4v14H7V3z" />
      <path d="M10 12h6M10 16h6M10 8h3" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
      <path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z" />
      <path d="M9 4v13M15 7v13" />
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
};

const NAV_ITEMS = [
  { id: "dashboard", label: "Home", path: "/worker" },
  { id: "tasks", label: "Tasks", path: "/worker/tasks" },
  { id: "map", label: "Map", path: "/worker/map" },
  { id: "notifications", label: "Alerts", path: "/worker/notifications" },
  { id: "profile", label: "Profile", path: "/worker/profile" },
];

/** Bottom tab bar for the Worker role (Step 6), mirroring the Citizen
 * app's `BottomNavigation` so all three roles feel consistent. */
export default function WorkerBottomNav({ notificationCount = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) =>
    path === "/worker" ? location.pathname === "/worker" : location.pathname.startsWith(path);

  return (
    <nav className="relative z-10 flex items-end border-t border-orange-100 bg-white px-1 pb-2 pt-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.path)}
            className="relative flex flex-1 flex-col items-center gap-1 py-2"
          >
            <span className={active ? "text-orange-600" : "text-orange-900/40"}>
              {ICONS[item.id]}
            </span>
            {item.id === "notifications" && notificationCount > 0 && (
              <span className="absolute right-1/2 top-0.5 flex h-4 min-w-4 translate-x-3 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                {notificationCount > 9 ? "9+" : notificationCount}
              </span>
            )}
            <span
              className={`text-[11px] font-medium ${active ? "text-orange-700" : "text-orange-900/40"}`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
