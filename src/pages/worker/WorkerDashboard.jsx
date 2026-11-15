import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import GovKpiCard from "../../components/GovKpiCard";
import StatusBadge from "../../components/StatusBadge";
import PriorityBadge from "../../components/PriorityBadge";
import FacilityMap from "../../components/FacilityMap";
import Icon from "../../components/Icon";
import { useComplaints } from "../../hooks/useComplaints";
import { useWorkerSession } from "../../hooks/useWorkerSession";
import { computeWorkerStats } from "../../utils/govStats";
import { workerMapFrame } from "../../utils/workerArea";
import { STATUS } from "../../data/complaints";

// Task pins: blue while assigned, amber once started (status colours).
const STATUS_PIN = {
  [STATUS.ASSIGNED]: "#2563eb",
  [STATUS.IN_PROGRESS]: "#d97706",
};

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The worker's dashboard, clean white like the citizen Home: compact stat
 * tiles (neutral icons, status only in a small dot), a map of their own area
 * and tasks with a "See full map" link, requesting a facility, and the
 * active tasks. One screen: only the task list scrolls.
 */
export default function WorkerDashboard() {
  const navigate = useNavigate();
  const complaints = useComplaints();
  const { worker } = useWorkerSession();
  const stats = useMemo(() => computeWorkerStats(complaints, worker.id), [complaints, worker.id]);

  const activeTasks = [...stats.active].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const taskMarkers = useMemo(
    () =>
      stats.active.map((task) => ({
        id: task.id,
        latitude: task.location.latitude,
        longitude: task.location.longitude,
        name: `#${task.id} · ${task.issueType}`,
        color: STATUS_PIN[task.status] ?? "#2563eb",
        glyph: "clipboard",
      })),
    [stats]
  );
  // Their own tasks (active first; otherwise every task they've had), or their area's city.
  const frame = useMemo(() => workerMapFrame(worker, stats.active.length ? stats.active : stats.mine), [worker, stats]);

  return (
    <WorkerShell title="Dashboard" noScroll>
      <div className="flex min-h-0 flex-1 flex-col gap-3 bg-white px-4 py-3">
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <GovKpiCard icon="reports" label="Assigned" value={stats.assignedCount} tone="new" onClick={() => navigate("/worker/tasks")} dense />
          <GovKpiCard icon="inbox" label="New" value={stats.newCount} tone="new" onClick={() => navigate("/worker/tasks?filter=assigned")} dense />
          <GovKpiCard icon="clock" label="In progress" value={stats.inProgressCount} tone="progress" onClick={() => navigate("/worker/tasks?filter=in_progress")} dense />
          <GovKpiCard icon="check" label="Completed" value={stats.completedCount} tone="done" onClick={() => navigate("/worker/tasks?filter=resolved")} dense />
          <GovKpiCard icon="alert" label="High priority" value={stats.highPriorityCount} tone="alert" onClick={() => navigate("/worker/tasks")} wide dense />
        </div>

        <section aria-labelledby="worker-map-title" className="shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h2 id="worker-map-title" className="text-lg leading-tight font-semibold text-ink">
              Your area
            </h2>
            <button
              type="button"
              onClick={() => navigate("/worker/map")}
              className="-my-2.5 -mr-1 flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-brand hover:text-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              See full map
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate("/worker/map")}
            aria-label={`Open the map of your area: ${taskMarkers.length} active ${taskMarkers.length === 1 ? "task" : "tasks"}`}
            data-worker-map
            data-area-city={frame.cityName}
            data-area-center={`${frame.center.latitude},${frame.center.longitude}`}
            className="mt-1.5 block h-24 w-full cursor-pointer overflow-hidden rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <FacilityMap
              markers={taskMarkers}
              center={frame.center}
              zoom={13}
              fitTo={frame.points}
              fitPadding={28}
              interactive={false}
              className="h-full rounded-none border-0"
            />
          </button>
        </section>

        <button
          type="button"
          onClick={() => navigate("/worker/facility-request")}
          className="flex min-h-12 shrink-0 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-white px-3 py-2 text-left hover:bg-section focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-section text-brand" aria-hidden="true">
            <Icon name="plus" className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Request a facility</span>
            <span className="block text-xs text-muted">Ask for a new dustbin or toilet</span>
          </span>
          <Icon name="chevronRight" className="h-5 w-5 text-muted" />
        </button>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between">
            <h2 className="text-lg leading-tight font-semibold text-ink">Active tasks</h2>
            <button
              type="button"
              onClick={() => navigate("/worker/tasks")}
              className="-my-2.5 -mr-1 flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-brand hover:text-brand-hover"
            >
              View all
            </button>
          </div>

          {/* Only this list scrolls; everything above and the tab bar stay put. */}
          <div className="mt-1.5 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {activeTasks.length === 0 && (
              <p data-empty-state className="flex items-center gap-2 py-2 text-sm text-muted">
                <Icon name="checkCircle" className="h-5 w-5" />
                {stats.mine.length === 0 ? "No tasks assigned yet." : "No active tasks. New assignments show up here."}
              </p>
            )}

            {activeTasks.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/worker/tasks/${c.id}`)}
                className="flex w-full cursor-pointer flex-col gap-2 rounded-2xl border border-line bg-white p-3 text-left hover:bg-section"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">#{c.id}</p>
                    <p className="text-sm font-semibold text-ink">{c.issueType}</p>
                  </div>
                  <PriorityBadge priority={c.priority} />
                </div>
                <p className="text-xs text-muted">{c.location.address}</p>
                <div className="flex items-center justify-between border-t border-line pt-2">
                  <span className="text-xs text-muted">Updated {formatDateTime(c.updatedAt)}</span>
                  <StatusBadge status={c.status} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </WorkerShell>
  );
}
