import { useNavigate } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import { useComplaints } from "../../hooks/useComplaints";
import { useWorkerSession } from "../../hooks/useWorkerSession";
import { getWorkerNotifications } from "../../utils/workerNotifications";

export default function WorkerNotifications() {
  const navigate = useNavigate();
  const complaints = useComplaints();
  const { worker } = useWorkerSession();
  const notifications = getWorkerNotifications(complaints, worker.id);

  return (
    <WorkerShell title="Notifications">
      <div className="flex flex-col gap-2 px-5 py-4">
        {notifications.length === 0 && (
          <p className="mt-6 text-center text-sm text-orange-900/50">
            You're all caught up — no notifications yet.
          </p>
        )}

        {notifications.map((n) => (
          <button
            key={n.key}
            type="button"
            onClick={() => navigate(`/worker/tasks/${n.complaintId}`)}
            className="flex items-start justify-between gap-3 rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm transition hover:bg-orange-50/50"
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  n.unread ? "bg-orange-600" : "bg-slate-300"
                }`}
              />
              <div>
                <p className="text-sm font-semibold text-slate-900">{n.message}</p>
                <p className="text-xs text-slate-500">{n.detail}</p>
              </div>
            </div>
            <span className="shrink-0 text-xs text-slate-400">{n.time}</span>
          </button>
        ))}
      </div>
    </WorkerShell>
  );
}
