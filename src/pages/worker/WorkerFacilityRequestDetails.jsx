import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import StatusBadge from "../../components/StatusBadge";
import PriorityBadge from "../../components/PriorityBadge";
import SimpleMap from "../../components/SimpleMap";
import { useFacilityRequest } from "../../hooks/useFacilityRequests";
import { REQUEST_STATUS } from "../../data/facilityRequests";

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WorkerFacilityRequestDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const request = useFacilityRequest(id);
  const [showSuccessBanner, setShowSuccessBanner] = useState(
    Boolean(routerLocation.state?.justSubmitted)
  );

  if (!request) {
    return (
      <WorkerShell title="Request Details" showBack onBack={() => navigate("/worker/facility-requests")}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <p className="font-semibold text-slate-900">Request not found</p>
          <p className="text-sm text-slate-500">This request may have been removed from the demo data set.</p>
          <button
            type="button"
            onClick={() => navigate("/worker/facility-requests")}
            className="mt-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Back to My Facility Requests
          </button>
        </div>
      </WorkerShell>
    );
  }

  return (
    <WorkerShell title="Request Details" showBack onBack={() => navigate("/worker/facility-requests")}>
      <div className="flex flex-col gap-4 px-5 py-4">
        {showSuccessBanner && (
          <div className="flex items-start gap-3 rounded-2xl bg-orange-600 p-4 text-white shadow-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <div className="flex-1">
              <p className="font-semibold">Request Submitted Successfully</p>
              <p className="mt-0.5 text-sm text-white/85">
                Request ID #{request.id} — status: PENDING. A Government Official will review it.
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

        <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">#{request.id}</p>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">Submitted {formatDateTime(request.createdAt)}</p>
          {request.isDemo && (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
              Prototype demo data
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">Facility Details</p>
          <div className="flex items-start gap-3">
            {request.photo ? (
              <img src={request.photo} alt="Requested facility location" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-2xl">
                {request.facilityType === "Public Toilet" ? "🚻" : "🗑️"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{request.suggestedName}</p>
              <p className="text-sm text-slate-500">{request.facilityType}</p>
              <p className="text-sm text-slate-500">{request.location.address}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <PriorityBadge priority={request.priority} />
              </div>
            </div>
          </div>
          <p className="mt-3 border-t border-orange-50 pt-3 text-sm text-slate-700">{request.reason}</p>
          {request.description && (
            <p className="mt-2 text-sm text-slate-500">{request.description}</p>
          )}
        </div>

        <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">Location</p>
          <SimpleMap
            latitude={request.location.latitude}
            longitude={request.location.longitude}
            markerLabel={request.location.address}
            className="h-40"
            interactive={false}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Lat: {request.location.latitude.toFixed(5)}</span>
            <span>Lng: {request.location.longitude.toFixed(5)}</span>
          </div>
        </div>

        {request.status === REQUEST_STATUS.REJECTED && request.rejectionReason && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
            <p className="mb-1 text-sm font-semibold text-red-800">Rejection Reason</p>
            <p className="text-sm text-red-700">{request.rejectionReason}</p>
          </div>
        )}

        <p className="text-center text-xs text-slate-400">
          Requests are reviewed and approved or rejected by a Government Official.
        </p>
      </div>
    </WorkerShell>
  );
}
