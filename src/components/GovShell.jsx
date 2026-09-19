import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Emblem from "./Emblem";
import { useAuth } from "../context/AuthContext";
import { GovNavIcons } from "./GovNavIcons";
import { useComplaints } from "../hooks/useComplaints";
import { useFacilityRequests } from "../hooks/useFacilityRequests";
import { useGovProfile, govInitials } from "../hooks/useGovProfile";
import { STATUS } from "../data/complaints";
import { REQUEST_STATUS } from "../data/facilityRequests";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", path: "/official" },
  { id: "complaints", label: "Complaints", path: "/official/complaints" },
  { id: "bins", label: "Bins", path: "/official/bins" },
  { id: "toilets", label: "Public Toilets", path: "/official/toilets" },
  { id: "facilityRequests", label: "Facility Requests", path: "/official/facility-requests" },
  { id: "workers", label: "Workers", path: "/official/workers" },
  { id: "analytics", label: "Analytics", path: "/official/analytics" },
  { id: "notifications", label: "Notifications", path: "/official/notifications" },
  { id: "profile", label: "Profile", path: "/official/profile" },
];

function isActivePath(pathname, itemPath) {
  if (itemPath === "/official") return pathname === "/official";
  return pathname.startsWith(itemPath);
}

function SidebarContent({ pathname, onNavigate, pendingFacilityRequests }) {
  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <Emblem className="h-9 w-9 shrink-0 text-white" showMotto={false} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">EcoSetu</p>
          <p className="truncate text-[11px] text-white/50">Smart Swachh Bharat · Government Console</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.path);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.path)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-sky-600 text-white shadow-md shadow-sky-900/30"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {GovNavIcons[item.id]}
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === "facilityRequests" && pendingFacilityRequests > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                      {pendingFacilityRequests}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-xs font-semibold text-white">Cleaner Cities</p>
          <p className="text-[11px] text-white/50">Greener Tomorrow</p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full">
            <div className="flex h-full w-full">
              <span className="h-full w-1/3 bg-brand-orange-500" />
              <span className="h-full w-1/3 bg-white" />
              <span className="h-full w-1/3 bg-brand-green-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GovShell({ title, subtitle, actions, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { resetAuth } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const complaints = useComplaints();
  const facilityRequests = useFacilityRequests();
  const { profile } = useGovProfile();

  const unreadCount = complaints.filter(
    (c) => c.status === STATUS.SUBMITTED
  ).length;
  const pendingFacilityRequests = facilityRequests.filter(
    (r) => r.status === REQUEST_STATUS.PENDING
  ).length;

  const handleNavigate = (path) => {
    setMobileOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    resetAuth();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-dvh">
          <SidebarContent pathname={location.pathname} onNavigate={handleNavigate} pendingFacilityRequests={pendingFacilityRequests} />
        </div>
      </aside>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] shadow-2xl">
            <div className="flex items-center justify-end bg-slate-900 px-3 pt-3">
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
              >
                {GovNavIcons.close}
              </button>
            </div>
            <SidebarContent pathname={location.pathname} onNavigate={handleNavigate} pendingFacilityRequests={pendingFacilityRequests} />
          </div>
        </div>
      )}

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
          >
            {GovNavIcons.menu}
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">{title}</h1>
            {subtitle && (
              <p className="truncate text-xs text-slate-500 sm:text-sm">{subtitle}</p>
            )}
          </div>

          {actions && <div className="hidden shrink-0 items-center gap-2 sm:flex">{actions}</div>}

          <button
            type="button"
            onClick={() => handleNavigate("/official/notifications")}
            aria-label="Notifications"
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            {GovNavIcons.notifications}
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleNavigate("/official/profile")}
            className="hidden shrink-0 items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 hover:bg-slate-50 sm:flex"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
              {govInitials(profile.name)}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-xs font-semibold text-slate-800">{profile.name}</span>
              <span className="block text-[10px] text-slate-500">{profile.district} District</span>
            </span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            {GovNavIcons.logout}
          </button>
        </header>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 sm:hidden">
            {actions}
          </div>
        )}

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
