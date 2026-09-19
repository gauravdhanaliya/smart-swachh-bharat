import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import { useCitizenNotifications } from "../hooks/useCitizenNotifications";

export default function CitizenNotifications() {
  const navigate = useNavigate();
  const { notifications, markAllRead } = useCitizenNotifications();

  // Opening the page counts as reading everything; the dots below stay
  // for this visit (see the hook) but the Home badge clears.
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <CitizenShell>
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button
          type="button"
          onClick={() => navigate("/citizen")}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-emerald-950">Notifications</h1>
      </div>

      <div className="flex flex-col gap-2 px-5 pb-8">
        {notifications.length === 0 && (
          <p className="mt-6 text-center text-sm text-emerald-900/50">
            You&apos;re all caught up — updates on your complaints will show up here.
          </p>
        )}

        {notifications.map((n) => (
          <button
            key={n.key}
            type="button"
            onClick={() => navigate(`/citizen/complaints/${n.complaintId}`)}
            className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm transition hover:bg-emerald-50"
          >
            <div className="flex items-start gap-3">
              <span
                aria-label={n.unread ? "Unread" : "Read"}
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.unread ? "bg-emerald-600" : "bg-slate-300"}`}
              />
              <div>
                <p className="text-sm font-semibold text-emerald-950">{n.message}</p>
                <p className="text-xs text-emerald-800/60">{n.detail}</p>
              </div>
            </div>
            <span className="shrink-0 text-xs text-emerald-800/40">{n.time}</span>
          </button>
        ))}
      </div>
    </CitizenShell>
  );
}
