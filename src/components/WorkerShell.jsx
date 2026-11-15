import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ConfirmDialog from "./ConfirmDialog";
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

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const handleLogout = () => {
    resetAuth();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <div className="min-h-dvh bg-section sm:py-4">
        <div className="device-frame device-frame--app">
          <div className="shrink-0 border-b border-line bg-white px-4 pt-3 pb-3 text-ink">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {showBack && (
                  <button
                    type="button"
                    onClick={onBack ?? (() => navigate(-1))}
                    aria-label="Go back"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-section"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 6l-6 6 6 6" />
                    </svg>
                  </button>
                )}
                {/* One block: avatar, name, then role and area (the area wraps, never cut off). */}
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-section text-sm font-semibold text-ink" aria-hidden="true">
                  {initials(worker.name)}
                </span>
                <div className="min-w-0" data-worker-identity>
                  <p className="truncate text-base leading-tight font-semibold">{worker.name}</p>
                  <p className="text-xs leading-snug text-muted">Sanitation Worker</p>
                  <p className="text-xs leading-snug text-muted">{worker.area}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => navigate("/worker/notifications")}
                  aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
                  className="relative flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-section"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z" />
                    <path d="M9.5 18a2.5 2.5 0 005 0" />
                  </svg>
                  {unread > 0 && (
                    <span data-unread-badge className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-600 ring-2 ring-white" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingLogout(true)}
                  aria-label="Logout"
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-section"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <path d="M16 17l5-5-5-5M21 12H9" />
                  </svg>
                </button>
              </div>
            </div>

            {title && <h1 className="mt-2 text-2xl font-semibold">{title}</h1>}
            {headerExtra}
          </div>

          <div className={noScroll ? "flex-1 flex flex-col min-h-0" : "flex-1 flex flex-col min-h-0 overflow-y-auto pb-4"}>
            {children}
          </div>

          <WorkerBottomNav notificationCount={unread} />
        </div>
      </div>
      <ConfirmDialog
        open={confirmingLogout}
        title="Log out of EcoSetu?"
        message="You can sign back in any time by choosing Sanitation Worker on the login page."
        confirmLabel="Log out"
        danger
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={handleLogout}
      />
    </>
  );
}
