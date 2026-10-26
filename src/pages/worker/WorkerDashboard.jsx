import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import StatTile from "../../components/StatTile";
import StatusBadge from "../../components/StatusBadge";
import PriorityBadge from "../../components/PriorityBadge";
import FacilityMap from "../../components/FacilityMap";
import { useComplaints } from "../../hooks/useComplaints";
import { useWorkerSession } from "../../hooks/useWorkerSession";
import { computeWorkerStats } from "../../utils/govStats";
import { STATUS } from "../../data/complaints";

const LUCKNOW = { latitude: 26.8467, longitude: 80.9462 };
const STATUS_DOT = {
  [STATUS.ASSIGNED]: "#0284c7",
  [STATUS.IN_PROGRESS]: "#e07a00",
};

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ICONS = {
  assigned: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h10l4 4v14H7V3z" />
      <path d="M10 12h6M10 16h6" />
    </svg>
  ),
  new: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  inProgress: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  completed: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  high: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01M10.3 4.3L2.7 18.7A1 1 0 003.6 20h16.8a1 1 0 00.9-1.3L13.7 4.3a1 1 0 00-1.7 0z" />
    </svg>
  ),
};

export default function WorkerDashboard() {
  const navigate = useNavigate();
  const complaints = useComplaints();
  const { worker } = useWorkerSession();
  const stats = computeWorkerStats(complaints, worker.id);

  const activeTasks = [...stats.active].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const taskMarkers = useMemo(
    () =>
      stats.active.map((task) => ({
        id: task.id,
        latitude: task.location.latitude,
        longitude: task.location.longitude,
        name: `#${task.id} · ${task.issueType}`,
        color: STATUS_DOT[task.status] ?? "#0284c7",
        glyph: "\u{1F9F9}",
      })),
    [stats.active]
  );

  return (
    <WorkerShell title="Dashboard" noScroll>
      {/* Sized to fit one screen with no scrolling: header stats/map/
          request-banner are fixed-height and shrink-0; only the active
          tasks list below gets its own internal scroll, so the header,
          stats and bottom nav never move even if there are many tasks. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-5 py-3">
        <p className="shrink-0 text-xs text-orange-900/70">
          Here's what's on your plate today in <span className="font-semibold">{worker.area}</span>.
        </p>

        <div className="grid shrink-0 grid-cols-2 gap-2">
          <StatTile
            icon={ICONS.assigned}
            label="Assigned Tasks"
            value={stats.assignedCount + stats.inProgressCount}
            color="sky"
            onClick={() => navigate("/worker/tasks")}
            compact
          />
          <StatTile
            icon={ICONS.new}
            label="New Tasks"
            value={stats.newCount}
            color="orange"
            onClick={() => navigate("/worker/tasks?filter=assigned")}
            compact
          />
          <StatTile
            icon={ICONS.inProgress}
            label="In Progress"
            value={stats.inProgressCount}
            color="orange"
            onClick={() => navigate("/worker/tasks?filter=in_progress")}
            compact
          />
          <StatTile
            icon={ICONS.completed}
            label="Completed"
            value={stats.completedCount}
            color="emerald"
            onClick={() => navigate("/worker/tasks?filter=resolved")}
            compact
          />
        </div>

        <StatTile
          icon={ICONS.high}
          label="High Priority Tasks"
          value={stats.highPriorityCount}
          color="red"
          onClick={() => navigate("/worker/tasks")}
          compact
        />

        <button
          type="button"
          onClick={() => navigate("/worker/map")}
          className="relative block w-full shrink-0 overflow-hidden rounded-2xl border border-orange-100 shadow-sm"
          style={{ height: 88 }}
        >
          <FacilityMap
            markers={taskMarkers}
            center={LUCKNOW}
            zoom={12}
            interactive={false}
            className="h-full"
          />
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-orange-800 shadow">
            {taskMarkers.length} Active Task{taskMarkers.length === 1 ? "" : "s"} on Map
          </span>
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-orange-700 shadow">
            Open Map →
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-dashed border-orange-300 bg-orange-50/60 p-2.5 shadow-sm">
          <button
            type="button"
            onClick={() => navigate("/worker/facility-request")}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-orange-950">Request Facility</span>
              <span className="block text-[11px] text-orange-900/60">Ask for a new dustbin/toilet</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/worker/facility-requests")}
            className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200"
          >
            My Requests
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between">
          <p className="text-xs font-bold text-orange-950">Active Tasks</p>
          <button
            type="button"
            onClick={() => navigate("/worker/tasks")}
            className="text-[11px] font-semibold text-orange-700"
          >
            View All →
          </button>
        </div>

        {/* Only this list scrolls internally — everything above and the
            bottom nav stay fixed no matter how many tasks there are. */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {activeTasks.length === 0 && (
            <p className="rounded-2xl border border-dashed border-orange-200 bg-white px-4 py-6 text-center text-xs text-orange-900/50">
              {stats.mine.length === 0 ? "No tasks assigned yet." : "No active tasks right now. New assignments will show up here."}
            </p>
          )}

          {activeTasks.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/worker/tasks/${c.id}`)}
              className="flex w-full flex-col gap-1.5 rounded-2xl border border-orange-100 bg-white p-3 text-left shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-500">#{c.id}</p>
                  <p className="text-sm font-semibold text-slate-900">{c.issueType}</p>
                </div>
                <PriorityBadge priority={c.priority} />
              </div>
              <p className="text-xs text-slate-600">{c.location.address}</p>
              <div className="flex items-center justify-between border-t border-orange-50 pt-1.5">
                <span className="text-[11px] text-slate-500">Updated {formatDateTime(c.updatedAt)}</span>
                <StatusBadge status={c.status} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </WorkerShell>
  );
}
