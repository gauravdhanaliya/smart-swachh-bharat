import { useMemo } from "react";
import GovShell from "../../components/GovShell";
import { useComplaints } from "../../hooks/useComplaints";
import { STATUS, STATUS_LABELS, COMPLAINT_TYPES } from "../../data/complaints";

function Bar({ label, value, max, colorClass }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-400">{value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function GovAnalytics() {
  const complaints = useComplaints();

  const byStatus = useMemo(
    () =>
      Object.values(STATUS).map((status) => ({
        status,
        count: complaints.filter((c) => c.status === status).length,
      })),
    [complaints]
  );

  const byIssueType = useMemo(
    () =>
      COMPLAINT_TYPES.map((t) => ({
        label: t.label,
        count: complaints.filter((c) => c.issueType === t.label).length,
      })).filter((row) => row.count > 0),
    [complaints]
  );

  const maxStatus = Math.max(1, ...byStatus.map((r) => r.count));
  const maxIssue = Math.max(1, ...byIssueType.map((r) => r.count));
  const resolvedPct = complaints.length
    ? Math.round((complaints.filter((c) => c.status === STATUS.RESOLVED).length / complaints.length) * 100)
    : 0;

  return (
    <GovShell title="Analytics" subtitle="Simple complaint statistics">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-bold text-slate-900">Complaints by Status</p>
          <div className="flex flex-col gap-3">
            {byStatus.map((row) => (
              <Bar
                key={row.status}
                label={STATUS_LABELS[row.status]}
                value={row.count}
                max={maxStatus}
                colorClass="bg-sky-600"
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-bold text-slate-900">Complaints by Issue Type</p>
          <div className="flex flex-col gap-3">
            {byIssueType.length === 0 && (
              <p className="text-sm text-slate-400">No complaints yet.</p>
            )}
            {byIssueType.map((row) => (
              <Bar
                key={row.label}
                label={row.label}
                value={row.count}
                max={maxIssue}
                colorClass="bg-emerald-600"
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <p className="mb-1 text-sm font-bold text-slate-900">Resolution Rate</p>
          <p className="text-3xl font-bold text-emerald-700">{resolvedPct}%</p>
          <p className="text-xs text-slate-500">
            {complaints.filter((c) => c.status === STATUS.RESOLVED).length} of {complaints.length} complaints resolved
          </p>
        </div>
      </div>
    </GovShell>
  );
}
