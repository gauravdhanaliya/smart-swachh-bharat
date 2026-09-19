import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import StatusBadge from "../components/StatusBadge";
import PriorityBadge from "../components/PriorityBadge";
import ComplaintTimeline from "../components/ComplaintTimeline";
import { useComplaint } from "../hooks/useComplaints";

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ComplaintTracking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const complaint = useComplaint(id);
  const [showSuccessBanner, setShowSuccessBanner] = useState(
    Boolean(location.state?.justSubmitted)
  );

  if (!complaint) {
    return (
      <CitizenShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-lg font-semibold text-emerald-950">Complaint not found</p>
          <p className="text-sm text-emerald-800/60">
            This complaint may have been removed from the demo data set.
          </p>
          <button
            type="button"
            onClick={() => navigate("/citizen/complaints")}
            className="mt-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Back to My Complaints
          </button>
        </div>
      </CitizenShell>
    );
  }

  return (
    <CitizenShell>
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button
          type="button"
          onClick={() => navigate("/citizen/complaints")}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-emerald-950">Complaint Tracking</h1>
      </div>

      <div className="flex flex-col gap-4 px-5 pb-8">
        {showSuccessBanner && (
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-700 p-4 text-white shadow-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <div className="flex-1">
              <p className="font-semibold">Complaint Submitted Successfully</p>
              <p className="mt-0.5 text-sm text-white/85">
                We'll keep this page updated as your complaint moves through the system.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSuccessBanner(false)}
              aria-label="Dismiss"
              className="text-white/80 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-emerald-800/60">#{complaint.id}</p>
            <StatusBadge status={complaint.status} />
          </div>
          <p className="mt-1 text-sm text-emerald-800/60">
            Submitted {formatDateTime(complaint.createdAt)}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-emerald-950">Timeline</p>
          <ComplaintTimeline status={complaint.status} />
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-emerald-950">Issue Details</p>
          <div className="flex items-start gap-3">
            {complaint.photo ? (
              <img
                src={complaint.photo}
                alt="Reported issue"
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-2xl">
                🗑️
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-emerald-950">{complaint.issueType}</p>
              <p className="text-sm text-emerald-800/60">{complaint.location.address}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <PriorityBadge priority={complaint.priority} />
              </div>
            </div>
          </div>
          <p className="mt-3 border-t border-emerald-50 pt-3 text-sm text-emerald-800/80">
            {complaint.description}
          </p>
        </div>

        {complaint.assignedWorkerName && (
          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-emerald-950">Assigned To</p>
            <p className="text-sm text-emerald-800/80">{complaint.assignedWorkerName}</p>
          </div>
        )}

        {complaint.resolutionNote && (
          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-emerald-950">Resolution Note</p>
            <p className="text-sm text-emerald-800/80">{complaint.resolutionNote}</p>
          </div>
        )}
      </div>
    </CitizenShell>
  );
}
