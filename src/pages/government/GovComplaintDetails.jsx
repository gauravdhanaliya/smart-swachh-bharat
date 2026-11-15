import { useState } from "react";
import { facilityLabel } from "../../utils/facility";
import { useNavigate, useParams } from "react-router-dom";
import GovShell from "../../components/GovShell";
import StatusBadge from "../../components/StatusBadge";
import PriorityBadge from "../../components/PriorityBadge";
import ComplaintTimeline from "../../components/ComplaintTimeline";
import { useComplaint, useComplaintsStatus } from "../../hooks/useComplaints";
import ProtectedImage from "../../components/ProtectedImage";
import { assignComplaint, updateComplaint } from "../../services/complaintService";
import { STATUS, PRIORITY } from "../../data/complaints";
import { useWorkers } from "../../hooks/useWorkers";

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
  const loadStatus = useComplaintsStatus();
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  // The live directory (demo + added workers, minus removed ones), as on the Workers page.
  const { workers } = useWorkers();
  const [error, setError] = useState("");
  const [assigning, setAssigning] = useState(false);

  if (!complaint && !loadStatus.loaded && !loadStatus.error) {
    return (
      <GovShell title="Complaint Details">
        <p role="status" className="px-5 py-10 text-center text-sm text-muted">
          Loading…
        </p>
      </GovShell>
    );
  }

  if (!complaint) {
    return (
      <GovShell title="Complaint Details">
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-white px-6 py-16 text-center">
          <p className="font-semibold text-ink">Complaint not found</p>
          <p className="text-sm text-muted">It may have been deleted, or the app's data was reset.</p>
          <button
            type="button"
            onClick={() => navigate("/official/complaints")}
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Back to Complaints
          </button>
        </div>
      </GovShell>
    );
  }

  const handleAssign = async () => {
    if (!selectedWorkerId) {
      setError("Select a worker to assign.");
      return;
    }
    setError("");
    setAssigning(true);
    const worker = workers.find((w) => w.id === selectedWorkerId);
    if (!worker) {
      setError("That worker is no longer in the directory.");
      setAssigning(false);
      return;
    }
    try {
      await assignComplaint(complaint.id, worker.id, worker.name);
    } catch (err) {
      // e.g. the API: that worker has no active account, or work already started
      setError(err?.fields?.workerId || err?.message || "The complaint couldn't be assigned.");
    } finally {
      setAssigning(false);
    }
  };

  const handlePriorityChange = async (e) => {
    setError("");
    try {
      await updateComplaint(complaint.id, { priority: e.target.value });
    } catch (err) {
      setError(err?.message || "The priority couldn't be changed.");
    }
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
          className="rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-section"
        >
          ← Back to Complaints
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-2xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted">#{complaint.id}</p>
                <p className="text-xl font-bold text-ink">{complaint.issueType}</p>
                {facilityLabel(complaint) && <p className="text-sm font-medium text-brand">{facilityLabel(complaint)}</p>}
              </div>
              <div className="flex items-center gap-2">
                <PriorityBadge priority={complaint.priority} />
                <StatusBadge status={complaint.status} />
              </div>
            </div>

            {complaint.photo && (
              <ProtectedImage
                src={complaint.photo}
                alt="Reported issue"
                className="mt-4 h-56 w-full rounded-xl object-cover"
              />
            )}

            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted">Location</dt>
                <dd className="text-sm text-slate-800">{complaint.location.address}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">Reported</dt>
                <dd className="text-sm text-slate-800">{formatDateTime(complaint.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">Citizen</dt>
                <dd className="text-sm text-slate-800">{complaint.citizenName}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">Assigned Worker</dt>
                <dd className="text-sm text-slate-800">
                  {complaint.assignedWorkerName ?? "Unassigned"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-line pt-4">
              <dt className="mb-1 text-xs font-medium text-muted">Description</dt>
              <dd className="text-sm text-slate-700">{complaint.description}</dd>
            </div>

            {complaint.resolutionNote && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">Resolution Note</p>
                <p className="mt-0.5 text-emerald-800/80">{complaint.resolutionNote}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="mb-3 text-sm font-bold text-ink">Status Timeline</p>
            <ComplaintTimeline status={complaint.status} />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="mb-2 text-sm font-bold text-ink">Priority</p>
            <select
              value={complaint.priority}
              onChange={handlePriorityChange}
              className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none"
            >
              {Object.values(PRIORITY).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {isUnassigned ? (
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="mb-2 text-sm font-bold text-ink">Assign Worker</p>
              <select
                value={selectedWorkerId}
                onChange={(e) => {
                  setSelectedWorkerId(e.target.value);
                  if (error) setError("");
                }}
                className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink focus:border-brand focus:outline-none"
              >
                <option value="" disabled>
                  Select a worker…
                </option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {w.area}
                  </option>
                ))}
              </select>
              {workers.length === 0 && (
                <p className="mt-1.5 text-xs text-muted">No workers in the directory. Add one on the Workers page.</p>
              )}
              {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
              <button
                type="button"
                onClick={handleAssign}
                disabled={assigning}
                className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sky-900/10 transition active:scale-[0.98] btn-disabled"
              >
                {assigning ? "Assigning…" : "Assign Complaint"}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="mb-1 text-sm font-bold text-ink">Assigned To</p>
              <p className="text-sm text-slate-700">{complaint.assignedWorkerName}</p>
              <p className="mt-1 text-xs text-muted">
                The complaint stays with this worker until it is resolved.
              </p>
            </div>
          )}
        </div>
      </div>
    </GovShell>
  );
}
