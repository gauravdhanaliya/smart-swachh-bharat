import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CARD_BUTTON, NAV_ITEM } from "./buttonStyles";

const NAV_ITEMS = [
  { id: "home", label: "Home", path: "/citizen" },
  { id: "map", label: "Map", path: "/citizen/map" },
];

const NAV_ITEMS_RIGHT = [
  { id: "complaints", label: "Complaints", path: "/citizen/complaints" },
  { id: "profile", label: "Profile", path: "/citizen/profile" },
];

function NavIcon({ id, active }) {
  const stroke = active ? "#178a49" : "#7fa88f";
  const common = { fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (id) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v9h14v-9" />
        </svg>
      );
    case "map":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
          <path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z" />
          <path d="M9 4v13M15 7v13" />
        </svg>
      );
    case "complaints":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
          <path d="M7 3h7l4 4v14H7V3z" />
          <path d="M10 12h4M10 16h4" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.6-4 5-6 8-6s6.4 2 8 6" />
        </svg>
      );
    default:
      return null;
  }
}

function NavButton({ item, active, onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(item)}
      className={NAV_ITEM}
    >
      <NavIcon id={item.id} active={active} />
      <span className={`text-[11px] font-medium ${active ? "text-emerald-700" : "text-emerald-800/50"}`}>
        {item.label}
      </span>
    </button>
  );
}

export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showQuickActions, setShowQuickActions] = useState(false);
  const fabRef = useRef(null);

  const handleNavigate = (item) => {
    if (!item.path) return;
    setShowQuickActions(false);
    navigate(item.path);
  };

  const isActive = (path) =>
    path === "/citizen" ? location.pathname === "/citizen" : location.pathname.startsWith(path);

  // Escape closes the sheet and hands focus back to the button that
  // opened it, so keyboard users don't lose their place.
  useEffect(() => {
    if (!showQuickActions) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setShowQuickActions(false);
      fabRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showQuickActions]);

  return (
    <>
      {/* USABILITY AUDIT FIX (round 2, issue 2 — Quick Actions sheet
          overlapped the tab bar): the sheet used to be `fixed` to the
          viewport bottom at z-30, so it painted straight over the nav
          bar (z-10) — and on desktop, where the phone frame is inset,
          it didn't even line up with the frame's own bottom edge.
          Now the sheet is anchored to the nav bar itself (see below):
          it opens *above* the bar, which stays visible and tappable.
          This scrim only dims the page content behind both, so it sits
          one layer under the nav. */}
      {showQuickActions && (
        <div
          className="fixed inset-0 z-20 bg-emerald-950/40"
          onClick={() => setShowQuickActions(false)}
          aria-hidden="true"
        />
      )}

      <nav
        className={`relative shrink-0 ${showQuickActions ? "z-30" : "z-10"} flex items-end border-t border-emerald-100 bg-white px-2 pb-2 pt-1 shadow-[0_-6px_16px_-8px_rgba(15,110,58,0.18)]`}
      >
        {showQuickActions && (
          <QuickActionsSheet
            onNavigate={(path) => {
              setShowQuickActions(false);
              navigate(path);
            }}
          />
        )}

        {NAV_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} active={isActive(item.path)} onNavigate={handleNavigate} />
        ))}

        <div className="flex flex-1 justify-center">
          {/* USABILITY AUDIT FIX (issue 4 — FAB breaks the nav bar's
              rhythm): every sibling NavButton is icon-over-label; this
              was icon-only with just an aria-label, so it read as an
              unexplained circle rather than a nav item. The label now
              lives inside the button as real content — matching how
              NavButton itself is structured — which also makes it the
              button's accessible name, so the separate aria-label (now
              redundant with the visible text) is dropped.

              Round 2: it now uses the exact NAV_ITEM class string (py-2,
              was py-1) so it is the same button style as its siblings,
              the circle's overhang went -mt-6 -> -mt-7 to keep the bar
              the same height, and while the sheet is open the "+" turns
              into an "x" (aria-expanded tells assistive tech) so the
              same control that opened the sheet visibly closes it. */}
          <button
            ref={fabRef}
            type="button"
            onClick={() => setShowQuickActions((open) => !open)}
            aria-expanded={showQuickActions}
            aria-haspopup="dialog"
            className={NAV_ITEM}
          >
            <span className="-mt-7 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg shadow-emerald-900/30 transition-transform active:scale-95">
              <svg
                viewBox="0 0 24 24"
                className={`h-6 w-6 transition-transform ${showQuickActions ? "rotate-45" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="text-[11px] font-medium text-emerald-700">Quick Actions</span>
          </button>
        </div>

        {NAV_ITEMS_RIGHT.map((item) => (
          <NavButton key={item.id} item={item} active={isActive(item.path)} onNavigate={handleNavigate} />
        ))}
      </nav>
    </>
  );
}

function QuickActionsSheet({ onNavigate }) {
  const actions = [
    {
      id: "report",
      label: "Report Issue",
      path: "/citizen/report",
      icon: (
        <path d="M12 9v4M12 17h.01M10.3 4.3L2.7 18.7A1 1 0 0 0 3.6 20h16.8a1 1 0 0 0 .9-1.3L13.7 4.3a1 1 0 0 0-1.7 0z" />
      ),
    },
    {
      id: "my-complaints",
      label: "My Complaints",
      path: "/citizen/complaints",
      icon: <path d="M7 3h7l4 4v14H7V3zM10 12h4M10 16h4" />,
    },
    {
      id: "find-bin",
      label: "Find Bin",
      path: "/citizen/map?filter=bins",
      icon: <path d="M6 7h12l-1 13H7L6 7zM9 7V4h6v3M10 11v5M14 11v5" />,
    },
    {
      id: "find-toilet",
      label: "Find Toilet",
      path: "/citizen/map?filter=toilets",
      icon: <path d="M7 21V9a4 4 0 118 0v12M4 21h16M9 9h6" />,
    },
  ];

  // Anchored to the <nav> (which is `relative`): `bottom-full` puts the
  // sheet's bottom edge on the bar's top edge, and pb-7 leaves room for
  // the ~16px the centre button overhangs the bar — so nothing collides. The
  // wrapper ignores pointer events so taps in the gap fall through to
  // the scrim and close the sheet; only the card itself is interactive.
  return (
    <div
      role="dialog"
      aria-labelledby="quick-actions-title"
      className="pointer-events-none absolute inset-x-0 bottom-full px-3 pb-7 animate-fade-in-up"
    >
      <div className="pointer-events-auto max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-3xl bg-white p-4 shadow-xl shadow-emerald-950/20 ring-1 ring-emerald-100">
        <p id="quick-actions-title" className="mb-3 text-sm font-semibold text-emerald-950">
          Quick Actions
        </p>
        <div className="flex flex-col gap-2">
          {actions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              autoFocus={index === 0}
              disabled={action.disabled}
              onClick={() => !action.disabled && onNavigate(action.path)}
              className={`${CARD_BUTTON} disabled:opacity-50 disabled:hover:bg-white`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {action.icon}
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-emerald-950">{action.label}</span>
                {action.description && (
                  <span className="block text-xs text-emerald-800/60">{action.description}</span>
                )}
              </span>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
