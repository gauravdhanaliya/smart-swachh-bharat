import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";

// Five equal tabs, the same shape each (Report included), one-line labels.
// The active tab is brand green; nothing is raised above the bar, so nothing
// ever overlaps the page content.
const TABS = [
  { id: "home", label: "Home", path: "/citizen", icon: "home" },
  { id: "map", label: "Map", path: "/citizen/map", icon: "map" },
  { id: "report", label: "Report", path: "/citizen/report", icon: "plus" },
  { id: "complaints", label: "Reports", path: "/citizen/complaints", icon: "reports" },
  { id: "profile", label: "Profile", path: "/citizen/profile", icon: "user" },
];

/** The citizen's tab bar: Home, Map, Report, Reports (their own), Profile. One line each (npm run test:layout checks). */
export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path) => (path === "/citizen" ? location.pathname === "/citizen" : location.pathname.startsWith(path));

  return (
    <nav aria-label="Main" data-bottom-nav className="relative z-10 shrink-0 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = isActive(tab.path);
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => navigate(tab.path)}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none focus-visible:ring-inset ${active ? "text-brand" : "text-muted hover:text-ink"}`}
              >
                <Icon name={tab.icon} className="h-6 w-6" />
                <span data-one-line className={`text-xs leading-4 whitespace-nowrap ${active ? "font-semibold" : "font-medium"}`}>
                  {tab.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
