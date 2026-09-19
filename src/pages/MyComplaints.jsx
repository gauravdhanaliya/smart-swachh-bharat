import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import StatusBadge from "../components/StatusBadge";
import { useComplaints } from "../hooks/useComplaints";
import { STATUS } from "../data/complaints";

const TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "resolved", label: "Resolved" },
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

export default function MyComplaints() {
  const navigate = useNavigate();
  const complaints = useComplaints();
  const [tab, setTab] = useState("all");

  const filtered = useMemo(() => {
    if (tab === "resolved") return complaints.filter((c) => c.status === STATUS.RESOLVED);
    if (tab === "pending") return complaints.filter((c) => c.status !== STATUS.RESOLVED);
    return complaints;
  }, [complaints, tab]);

  return (
    <CitizenShell>
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-emerald-950">My Complaints</h1>
      </div>

      <div className="flex gap-2 px-5 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              tab === t.id
                ? "bg-emerald-700 text-white"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 px-5 pb-8">
        {filtered.length === 0 && (
          <p className="mt-6 text-center text-sm text-emerald-800/60">
            No complaints in this category yet.
          </p>
        )}

        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(`/citizen/complaints/${c.id}`)}
            className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-950">{c.issueType}</p>
              <p className="mt-0.5 text-xs text-emerald-800/60">{c.location.address}</p>
              <p className="mt-0.5 text-[11px] text-emerald-800/40">
                #{c.id} · {timeAgo(c.createdAt)}
              </p>
            </div>
            <StatusBadge status={c.status} className="shrink-0" />
          </button>
        ))}
      </div>
    </CitizenShell>
  );
}
