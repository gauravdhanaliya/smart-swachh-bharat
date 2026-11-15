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

// Whether the person has an account yet. Text, not colour alone.
function AccountBadge({ status }) {
  if (status === "active")
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-200">Account active</span>;
  if (status === "invited")
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-200">Waiting for sign-up</span>;
  return null;
}

export default function GovWorkers() {
  const complaints = useComplaints();
  const { workers, addWorker, removeWorker } = useWorkers();
  const { profile } = useGovProfile();
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [error, setError] = useState("");

  // The dialog waits for the server; a refusal (for example the email is
  // already in the directory) shows in the dialog, with what was typed kept.
  const handleAddConfirm = async (draft) => {
    setError("");
    await addWorker(draft);
    setAdding(false);
  };

  const handleRemoveConfirm = (reason) => {
    setError("");
    Promise.resolve(removeWorker(removeTarget, { reason, removedBy: profile.name })).catch((err) =>
      setError(err?.message || "The worker couldn't be removed.")
    );
    setRemoveTarget(null);
  };

  return (
    <GovShell title="Workers" subtitle="Sanitation field staff directory">
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add worker
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
            <div key={worker.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
                    {worker.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                  <div>
                    <p className="font-semibold text-ink">{worker.name}</p>
                    <p className="text-xs text-muted">{worker.role}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-muted">{worker.displayId}</span>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[worker.status] ?? "bg-slate-400"}`} aria-hidden="true" />
                {worker.status}
                {worker.area && (
                  <>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span>{worker.area}</span>
                  </>
                )}
              </div>
              {(worker.emailMasked || worker.accountStatus) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {worker.emailMasked && <span className="text-slate-600">{worker.emailMasked}</span>}
                  <AccountBadge status={worker.accountStatus} />
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <div>
                  <p className="text-lg font-bold text-ink">{activeCount}</p>
                  <p className="text-[11px] text-muted">Active tasks</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-ink">{assignedCount}</p>
                  <p className="text-[11px] text-muted">Total assigned</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRemoveTarget(worker)}
                className="mt-3 w-full rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
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
