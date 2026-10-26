import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import StatusBadge from "../components/StatusBadge";
import { useComplaints } from "../hooks/useComplaints";
import { voteComplaint } from "../services/complaintService";
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

function VoteButton({ direction, active, count, onClick }) {
  const up = direction === "up";
  const activeStyle = up
    ? "border-emerald-600 bg-emerald-600 text-white"
    : "border-red-500 bg-red-500 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${up ? "Upvote" : "Downvote"}, ${count}`}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active ? activeStyle : "border-emerald-100 bg-white text-emerald-800/70 hover:bg-emerald-50"
      }`}
    >
      <svg viewBox="0 0 24 24" className={`h-4 w-4 ${up ? "" : "rotate-180"}`} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 11v9H4v-9h3zm0 0l4-8c1.5 0 2.5 1 2.5 2.5V9H19a2 2 0 012 2.3l-1 7A2 2 0 0118 20H7" />
      </svg>
      {count}
    </button>
  );
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
        {complaints.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-emerald-200 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-emerald-900">No complaints yet. Report your first issue.</p>
            <button
              type="button"
              onClick={() => navigate("/citizen/report")}
              className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              Report Issue
            </button>
          </div>
        )}

        {complaints.length > 0 && filtered.length === 0 && (
          <p className="mt-6 text-center text-sm text-emerald-800/60">
            No complaints in this category yet.
          </p>
        )}

        {filtered.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-emerald-100 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => navigate(`/citizen/complaints/${c.id}`)}
              className="flex w-full items-start justify-between gap-3 p-4 pb-3 text-left"
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
            <div className="flex items-center gap-2 border-t border-emerald-50 px-4 py-2">
              <VoteButton
                direction="up"
                active={c.myVote === "up"}
                count={c.upvotes ?? 0}
                onClick={() => voteComplaint(c.id, "up")}
              />
              <VoteButton
                direction="down"
                active={c.myVote === "down"}
                count={c.downvotes ?? 0}
                onClick={() => voteComplaint(c.id, "down")}
              />
            </div>
          </div>
        ))}
      </div>
    </CitizenShell>
  );
}
