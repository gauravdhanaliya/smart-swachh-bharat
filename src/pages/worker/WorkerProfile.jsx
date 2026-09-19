import { useNavigate } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import { useAuth } from "../../context/AuthContext";
import { useComplaints } from "../../hooks/useComplaints";
import { useWorkerSession } from "../../hooks/useWorkerSession";
import { WORKERS } from "../../data/workers";
import { STATUS } from "../../data/complaints";

const STATUS_DOT = {
  Available: "bg-emerald-500",
  "On Duty": "bg-orange-500",
};

function initials(name) {
  return name.split(" ").map((n) => n[0]).join("");
}

export default function WorkerProfile() {
  const navigate = useNavigate();
  const { resetAuth } = useAuth();
  const complaints = useComplaints();
  const { worker, setWorkerId } = useWorkerSession();

  const assignedTaskCount = complaints.filter((c) => c.assignedWorkerId === worker.id).length;
  const completedTaskCount = complaints.filter(
    (c) => c.assignedWorkerId === worker.id && c.status === STATUS.RESOLVED
  ).length;

  const handleLogout = () => {
    resetAuth();
    navigate("/login", { replace: true });
  };

  return (
    <WorkerShell title="Profile">
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-bold text-orange-700">
            {initials(worker.name)}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{worker.name}</p>
            <p className="text-sm text-slate-500">{worker.role}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[worker.status] ?? "bg-slate-400"}`} />
              {worker.status}
              <span className="text-slate-300">·</span>
              {worker.area}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-orange-100 bg-white p-4 text-center shadow-sm">
            <p className="text-xl font-bold text-slate-900">{assignedTaskCount}</p>
            <p className="text-xs text-slate-500">Assigned Tasks</p>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-white p-4 text-center shadow-sm">
            <p className="text-xl font-bold text-slate-900">{completedTaskCount}</p>
            <p className="text-xs text-slate-500">Completed Tasks</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/worker/facility-requests")}
          className="flex items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="text-sm font-semibold text-slate-900">My Facility Requests</span>
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>

        <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-bold text-slate-900">Switch Demo Worker</p>
          <p className="mb-2 text-xs text-slate-500">
            For this prototype, pick which sanitation worker you're signed in as.
          </p>
          <select
            value={worker.id}
            onChange={(e) => setWorkerId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-orange-400 focus:outline-none"
          >
            {WORKERS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.area}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-2 flex items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <path d="M16 17l5-5-5-5M21 12H9" />
          </svg>
          Logout
        </button>
      </div>
    </WorkerShell>
  );
}
