import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWorkerSession } from "../hooks/useWorkerSession";
import { useComplaints } from "../hooks/useComplaints";
import { countUnreadWorkerNotifications } from "../utils/workerNotifications";
import WorkerBottomNav from "./WorkerBottomNav";

function initials(name) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("");
}

/**
 * Shared phone-frame shell for every Worker screen (Step 6): header with
 * the signed-in demo worker's name/area and a notification bell, plus the
 * bottom tab bar. Mirrors `CitizenShell`/`GovShell` so all three roles use
 * the same visual language.
 */
export default function WorkerShell({
  title,
  showBack = false,
  onBack,
  headerExtra,
  noScroll = false,
  children,
}) {
  const navigate = useNavigate();
  const { resetAuth } = useAuth();
  const { worker } = useWorkerSession();
  const complaints = useComplaints();
  const unread = countUnreadWorkerNotifications(complaints, worker.id);

  const handleLogout = () => {
    resetAuth();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-orange-50/40 sm:py-4">
      <div className="device-frame device-frame--app">
        <div className="shrink-0 bg-orange-600 px-5 pb-4 pt-5 text-white">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
              EcoSetu · Smart Swachh Bharat
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {showBack && (
                <button
                  type="button"
                  onClick={onBack ?? (() => navigate(-1))}
                  aria-label="Go back"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
              )}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
                {initials(worker.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold leading-tight">{worker.name}</p>
                <p className="truncate text-[11px] text-white/70">
                  Sanitation Worker · {worker.area}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => navigate("/worker/notifications")}
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z" />
                  <path d="M9.5 18a2.5 2.5 0 005 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-orange-700">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Logout"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <path d="M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
            </div>
          </div>

          {title && <h1 className="mt-3 text-lg font-bold">{title}</h1>}
          {headerExtra}
        </div>

        <div className={noScroll ? "flex-1 flex flex-col min-h-0" : "flex-1 flex flex-col min-h-0 overflow-y-auto pb-4"}>
          {children}
        </div>

        <WorkerBottomNav notificationCount={unread} />
      </div>
    </div>
  );
}
