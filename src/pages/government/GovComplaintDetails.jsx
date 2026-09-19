import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import GovShell from "../../components/GovShell";
import StatusBadge from "../../components/StatusBadge";
import PriorityBadge from "../../components/PriorityBadge";
import ComplaintTimeline from "../../components/ComplaintTimeline";
import { useComplaint } from "../../hooks/useComplaints";
import { assignComplaint, updateComplaint } from "../../services/complaintService";
import { STATUS, PRIORITY, WORKERS } from "../../data/complaints";

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function GovComplaintDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const complaint = useComplaint(id);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [error, setError] = useState("");
  const [assigning, setAssigning] = useState(false);

  if (!complaint) {
    return (
      <GovShell title="Complaint Details">
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <p className="font-semibold text-slate-900">Complaint not found</p>
          <p className="text-sm text-slate-500">It may have been removed from the demo data set.</p>
          <button
            type="button"
            onClick={() => navigate("/official/complaints")}
            className="mt-3 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Back to Complaints
          </button>
        </div>
      </GovShell>
    );
  }

  const handleAssign = () => {
    if (!selectedWorkerId) {
      setError("Select a worker to assign.");
      return;
    }
    setAssigning(true);
    const worker = WORKERS.find((w) => w.id === selectedWorkerId);
    try {
      assignComplaint(complaint.id, worker.id, worker.name);
    } finally {
      setAssigning(false);
    }
  };

  const handlePriorityChange = (e) => {
    updateComplaint(complaint.id, { priority: e.target.value });
  };

  const isUnassigned = complaint.status === STATUS.SUBMITTED;

  return (
    <GovShell
      title={`Complaint #${complaint.id}`}
      subtitle={complaint.issueType}
      actions={
        <button
          type="button"
          onClick={() => navigate("/official/complaints")}
          className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          ← Back to Complaints
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">#{complaint.id}</p>
                <p className="text-xl font-bold text-slate-900">{complaint.issueType}</p>
              </div>
              <div className="flex items-center gap-2">
                <PriorityBadge priority={complaint.priority} />
                <StatusBadge status={complaint.status} />
              </div>
            </div>

            {complaint.photo && (
              <img
                src={complaint.photo}
                alt="Reported issue"
                className="mt-4 h-56 w-full rounded-xl object-cover"
              />
            )}

            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-slate-400">Location</dt>
                <dd className="text-sm text-slate-800">{complaint.location.address}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400">Reported</dt>
                <dd className="text-sm text-slate-800">{formatDateTime(complaint.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400">Citizen</dt>
                <dd className="text-sm text-slate-800">{complaint.citizenName}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400">Assigned Worker</dt>
                <dd className="text-sm text-slate-800">
                  {complaint.assignedWorkerName ?? "Unassigned"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <dt className="mb-1 text-xs font-medium text-slate-400">Description</dt>
              <dd className="text-sm text-slate-700">{complaint.description}</dd>
            </div>

            {complaint.resolutionNote && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">Resolution Note</p>
                <p className="mt-0.5 text-emerald-800/80">{complaint.resolutionNote}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-bold text-slate-900">Status Timeline</p>
            <ComplaintTimeline status={complaint.status} />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-2 text-sm font-bold text-slate-900">Priority</p>
            <select
              value={complaint.priority}
              onChange={handlePriorityChange}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none"
            >
              {Object.values(PRIORITY).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {isUnassigned ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-2 text-sm font-bold text-slate-900">Assign Worker</p>
              <select
                value={selectedWorkerId}
                onChange={(e) => {
                  setSelectedWorkerId(e.target.value);
                  if (error) setError("");
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none"
              >
                <option value="" disabled>
                  Select a worker…
                </option>
                {WORKERS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {w.area}
                  </option>
                ))}
              </select>
              {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
              <button
                type="button"
                onClick={handleAssign}
                disabled={assigning}
                className="mt-3 w-full rounded-full bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-sky-900/10 transition active:scale-[0.98] disabled:opacity-60"
              >
                {assigning ? "Assigning…" : "Assign Complaint"}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-1 text-sm font-bold text-slate-900">Assigned To</p>
              <p className="text-sm text-slate-700">{complaint.assignedWorkerName}</p>
              <p className="mt-1 text-xs text-slate-400">
                Reassignment isn't needed for this demo once a worker is on the job.
              </p>
            </div>
          )}
        </div>
      </div>
    </GovShell>
  );
}
