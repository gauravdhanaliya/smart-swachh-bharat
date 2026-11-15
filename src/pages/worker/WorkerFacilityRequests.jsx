import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import StatusBadge from "../../components/StatusBadge";
import PriorityBadge from "../../components/PriorityBadge";
import { useFacilityRequestsForWorker } from "../../hooks/useFacilityRequests";
import { useWorkerSession } from "../../hooks/useWorkerSession";
import { REQUEST_STATUS } from "../../data/facilityRequests";
import Glyph from "../../components/Glyph";

const TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function WorkerFacilityRequests() {
  const navigate = useNavigate();
  const { worker } = useWorkerSession();
  const requests = useFacilityRequestsForWorker(worker.id);
  const [tab, setTab] = useState("all");

  const filtered = useMemo(() => {
    if (tab === "pending")
      return requests.filter(
        (r) => r.status === REQUEST_STATUS.PENDING || r.status === REQUEST_STATUS.UNDER_REVIEW
      );
    if (tab === "approved") return requests.filter((r) => r.status === REQUEST_STATUS.APPROVED);
    if (tab === "rejected") return requests.filter((r) => r.status === REQUEST_STATUS.REJECTED);
    return requests;
  }, [requests, tab]);

  return (
    <WorkerShell title="My Facility Requests" showBack onBack={() => navigate(-1)}>
      <div className="flex gap-2 px-5 pb-3 pt-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${ tab === t.id ? "bg-brand text-white" : "bg-section text-brand hover:bg-section" }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 px-5 pb-8">
        <button
          type="button"
          onClick={() => navigate("/worker/facility-request")}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-line bg-white px-4 py-3 text-sm font-semibold text-brand hover:bg-section"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Facility Request
        </button>

        {filtered.length === 0 && (
          <p className="mt-2 text-center text-sm text-slate-500">
            No facility requests in this category yet.
          </p>
        )}

        {filtered.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => navigate(`/worker/facility-requests/${r.id}`)}
            className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-white p-4 text-left"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                <Glyph value={r.facilityType === "Public Toilet" ? "🚻" : "🗑️"} className="inline h-4 w-4 align-[-2px]" /> {r.suggestedName}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{r.location.address}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                #{r.id} · {timeAgo(r.createdAt)}
              </p>
              <div className="mt-1.5">
                <PriorityBadge priority={r.priority} />
              </div>
            </div>
            <StatusBadge status={r.status} className="shrink-0" />
          </button>
        ))}
      </div>
    </WorkerShell>
  );
}
