import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import StatusBadge from "../../components/StatusBadge";
import PriorityBadge from "../../components/PriorityBadge";
import StatusFilterTabs from "../../components/StatusFilterTabs";
import { useComplaints } from "../../hooks/useComplaints";
import { useWorkerSession } from "../../hooks/useWorkerSession";
import { STATUS } from "../../data/complaints";

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const FILTER_STATUS = {
  assigned: STATUS.ASSIGNED,
  in_progress: STATUS.IN_PROGRESS,
  resolved: STATUS.RESOLVED,
};

export default function WorkerTasks() {
  const navigate = useNavigate();
  const complaints = useComplaints();
  const { worker } = useWorkerSession();
  const [searchParams] = useSearchParams();

  const initialFilter = searchParams.get("filter") ?? "all";
  const [filter, setFilter] = useState(
    FILTERS.some((f) => f.value === initialFilter) ? initialFilter : "all"
  );

  // Step 6 — only the currently signed-in demo worker's own tasks, not
  // every worker's, per the spec's "My Tasks" requirement.
  const myTasks = useMemo(
    () => complaints.filter((c) => c.assignedWorkerId === worker.id),
    [complaints, worker.id]
  );

  const counts = useMemo(
    () => ({
      all: myTasks.length,
      assigned: myTasks.filter((c) => c.status === STATUS.ASSIGNED).length,
      in_progress: myTasks.filter((c) => c.status === STATUS.IN_PROGRESS).length,
      resolved: myTasks.filter((c) => c.status === STATUS.RESOLVED).length,
    }),
    [myTasks]
  );

  const visibleTasks = useMemo(() => {
    const list =
      filter === "all"
        ? myTasks
        : myTasks.filter((c) => c.status === FILTER_STATUS[filter]);
    return [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [myTasks, filter]);

  return (
    <WorkerShell title="My Tasks">
      <div className="flex flex-col gap-3 px-5 py-4">
        <StatusFilterTabs
          options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
          value={filter}
          onChange={setFilter}
        />

        <p className="text-xs text-orange-900/50">
          {visibleTasks.length} task{visibleTasks.length === 1 ? "" : "s"}
        </p>

        {visibleTasks.length === 0 && (
          <p className="mt-6 text-center text-sm text-orange-900/50">
            No tasks in this view. Check back soon.
          </p>
        )}

        {visibleTasks.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(`/worker/tasks/${c.id}`)}
            className="flex flex-col gap-2 rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">#{c.id}</p>
                <p className="font-semibold text-slate-900">{c.issueType}</p>
              </div>
              <PriorityBadge priority={c.priority} />
            </div>
            <p className="text-sm text-slate-600">{c.location.address}</p>
            <p className="line-clamp-2 text-xs text-slate-500">{c.description}</p>
            <div className="flex items-center justify-between border-t border-orange-50 pt-2">
              <span className="text-xs text-slate-500">
                {c.status === STATUS.ASSIGNED ? "Assigned" : "Updated"}{" "}
                {formatDateTime(c.updatedAt)}
              </span>
              <StatusBadge status={c.status} />
            </div>
          </button>
        ))}
      </div>
    </WorkerShell>
  );
}
