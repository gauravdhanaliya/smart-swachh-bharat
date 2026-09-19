import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import GovShell from "../../components/GovShell";
import { useComplaints } from "../../hooks/useComplaints";
import { STATUS } from "../../data/complaints";

const MESSAGES = {
  [STATUS.SUBMITTED]: (c) => `New complaint ${c.id} submitted — ${c.issueType} at ${c.location.address}.`,
  [STATUS.ASSIGNED]: (c) => `${c.id} assigned to ${c.assignedWorkerName ?? "a worker"}.`,
  [STATUS.IN_PROGRESS]: (c) => `${c.assignedWorkerName ?? "Worker"} started work on ${c.id}.`,
  [STATUS.RESOLVED]: (c) => `${c.id} marked resolved.`,
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function GovNotifications() {
  const complaints = useComplaints();
  const navigate = useNavigate();

  const items = useMemo(
    () =>
      [...complaints]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 12)
        .map((c) => ({
          id: c.id,
          message: (MESSAGES[c.status] ?? MESSAGES[STATUS.SUBMITTED])(c),
          time: timeAgo(c.updatedAt),
        })),
    [complaints]
  );

  return (
    <GovShell title="Notifications" subtitle="Recent activity across all complaints">
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <button
            key={`${item.id}-${item.time}`}
            type="button"
            onClick={() => navigate(`/official/complaints/${item.id}`)}
            className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50"
          >
            <p className="text-sm text-slate-800">{item.message}</p>
            <span className="shrink-0 text-xs text-slate-400">{item.time}</span>
          </button>
        ))}
      </div>
    </GovShell>
  );
}
