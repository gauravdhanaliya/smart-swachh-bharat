import { useState } from "react";
import GovShell from "../../components/GovShell";
import AddWorkerDialog from "../../components/AddWorkerDialog";
import RemoveWorkerDialog from "../../components/RemoveWorkerDialog";
import { useComplaints } from "../../hooks/useComplaints";
import { useWorkers } from "../../hooks/useWorkers";
import { useGovProfile } from "../../hooks/useGovProfile";
import { STATUS } from "../../data/complaints";
import { countComplaintsForWorker } from "../../utils/govStats";

const STATUS_DOT = {
  Available: "bg-emerald-500",
  "On Duty": "bg-orange-500",
};

export default function GovWorkers() {
  const complaints = useComplaints();
  const { workers, addWorker, removeWorker } = useWorkers();
  const { profile } = useGovProfile();
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  const handleAddConfirm = (draft) => {
    addWorker(draft);
    setAdding(false);
  };

  const handleRemoveConfirm = (reason) => {
    removeWorker(removeTarget, { reason, removedBy: profile.name });
    setRemoveTarget(null);
  };

  return (
    <GovShell title="Workers" subtitle="Sanitation field staff directory">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Worker
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {workers.map((worker) => {
          const assignedCount = countComplaintsForWorker(complaints, worker.id);
          const activeCount = complaints.filter(
            (c) =>
              c.assignedWorkerId === worker.id &&
              (c.status === STATUS.ASSIGNED || c.status === STATUS.IN_PROGRESS)
          ).length;

          return (
            <div key={worker.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
                    {worker.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{worker.name}</p>
                    <p className="text-xs text-slate-500">{worker.role}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-400">{worker.displayId}</span>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[worker.status] ?? "bg-slate-400"}`} />
                {worker.status}
                <span className="text-slate-300">·</span>
                <span>{worker.area}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">{activeCount}</p>
                  <p className="text-[11px] text-slate-500">Active tasks</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">{assignedCount}</p>
                  <p className="text-[11px] text-slate-500">Total assigned</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRemoveTarget(worker)}
                className="mt-3 w-full rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Remove Worker
              </button>
            </div>
          );
        })}
      </div>

      {adding && (
        <AddWorkerDialog onCancel={() => setAdding(false)} onConfirm={handleAddConfirm} />
      )}
      {removeTarget && (
        <RemoveWorkerDialog
          worker={removeTarget}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={handleRemoveConfirm}
        />
      )}
    </GovShell>
  );
}
