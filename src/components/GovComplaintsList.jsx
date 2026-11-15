import { useNavigate } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import PriorityBadge from "./PriorityBadge";
import { facilityLabel } from "../utils/facility";

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
      <div className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      {/* Table header — desktop only */}
      <div className="hidden grid-cols-[1fr_1.2fr_1.4fr_1fr_1fr_1fr_0.8fr] gap-3 border-b border-line bg-section px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted lg:grid">
        <span>ID</span>
        <span>Issue Type</span>
        <span>Location</span>
        <span>Date/Time</span>
        <span>Status</span>
        <span>Worker</span>
        <span>Priority</span>
      </div>

      <div className="divide-y divide-line">
        {complaints.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(`/official/complaints/${c.id}`)}
            className={`grid w-full grid-cols-2 gap-x-3 gap-y-1.5 border-l-4 px-4 py-3.5 text-left transition hover:bg-section lg:grid-cols-[1fr_1.2fr_1.4fr_1fr_1fr_1fr_0.8fr] lg:items-center lg:gap-y-0 ${ c.priority === "HIGH" ? "border-red-400" : "border-transparent" }`}
          >
            <span className="text-sm font-semibold text-brand">#{c.id}</span>
            <span className="col-span-2 text-sm font-medium text-ink lg:col-span-1">
              {c.issueType}
              {facilityLabel(c) && <span className="block text-xs font-medium text-brand">{facilityLabel(c)}</span>}
            </span>
            <span className="col-span-2 text-sm text-slate-600 lg:col-span-1">
              {c.location.address}
            </span>
            <span className="text-xs text-muted">{formatDateTime(c.createdAt)}</span>
            <span>
              <StatusBadge status={c.status} />
            </span>
            <span className="text-xs text-slate-600">
              {c.assignedWorkerName ?? <span className="text-muted">Unassigned</span>}
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
