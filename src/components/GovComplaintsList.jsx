import { useNavigate } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import PriorityBadge from "./PriorityBadge";

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function GovComplaintsList({ complaints, emptyMessage = "No complaints found." }) {
  const navigate = useNavigate();

  if (complaints.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Table header — desktop only */}
      <div className="hidden grid-cols-[1fr_1.2fr_1.4fr_1fr_1fr_1fr_0.8fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid">
        <span>ID</span>
        <span>Issue Type</span>
        <span>Location</span>
        <span>Date/Time</span>
        <span>Status</span>
        <span>Worker</span>
        <span>Priority</span>
      </div>

      <div className="divide-y divide-slate-100">
        {complaints.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(`/official/complaints/${c.id}`)}
            className={`grid w-full grid-cols-2 gap-x-3 gap-y-1.5 border-l-4 px-4 py-3.5 text-left transition hover:bg-slate-50 lg:grid-cols-[1fr_1.2fr_1.4fr_1fr_1fr_1fr_0.8fr] lg:items-center lg:gap-y-0 ${
              c.priority === "HIGH" ? "border-red-400" : "border-transparent"
            }`}
          >
            <span className="text-sm font-semibold text-sky-700">#{c.id}</span>
            <span className="col-span-2 text-sm font-medium text-slate-900 lg:col-span-1">
              {c.issueType}
            </span>
            <span className="col-span-2 text-sm text-slate-600 lg:col-span-1">
              {c.location.address}
            </span>
            <span className="text-xs text-slate-500">{formatDateTime(c.createdAt)}</span>
            <span>
              <StatusBadge status={c.status} />
            </span>
            <span className="text-xs text-slate-600">
              {c.assignedWorkerName ?? <span className="text-slate-400">Unassigned</span>}
            </span>
            <span>
              <PriorityBadge priority={c.priority} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
