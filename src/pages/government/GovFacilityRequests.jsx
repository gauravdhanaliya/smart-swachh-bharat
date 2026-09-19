import { useMemo, useState } from "react";
import GovShell from "../../components/GovShell";
import StatusBadge from "../../components/StatusBadge";
import PriorityBadge from "../../components/PriorityBadge";
import StatusFilterTabs from "../../components/StatusFilterTabs";
import { useFacilityRequests } from "../../hooks/useFacilityRequests";
import { updateFacilityRequestStatus } from "../../services/facilityRequestService";
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

function RequestCard({ request, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const isPending = request.status === REQUEST_STATUS.PENDING || request.status === REQUEST_STATUS.UNDER_REVIEW;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-400">{request.id}</p>
          <p className="font-semibold text-slate-900">{request.suggestedName}</p>
          <p className="text-xs text-slate-500">
            {request.facilityType} · {request.location.address}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={request.status} />
          <PriorityBadge priority={request.priority} />
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-700">{request.reason}</p>
      {request.description && <p className="mt-1 text-xs text-slate-500">{request.description}</p>}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>Requested by {request.requestedByWorkerName}</span>
        <span>{formatDateTime(request.createdAt)}</span>
      </div>

      {request.status === REQUEST_STATUS.REJECTED && request.rejectionReason && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          Rejected: {request.rejectionReason}
        </p>
      )}
      {request.status === REQUEST_STATUS.APPROVED && (
        <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Approved — now visible on Government and Citizen maps as {request.facilityType === "Dustbin" ? "WB" : "WT"}-{request.id}.
        </p>
      )}

      {isPending && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {rejecting ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection…"
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onReject(request.id, rejectionReason);
                    setRejecting(false);
                    setRejectionReason("");
                  }}
                  className="flex-1 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Confirm Reject
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onApprove(request.id)}
                className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: REQUEST_STATUS.PENDING, label: "Pending" },
  { value: REQUEST_STATUS.APPROVED, label: "Approved" },
  { value: REQUEST_STATUS.REJECTED, label: "Rejected" },
];

export default function GovFacilityRequests() {
  const requests = useFacilityRequests();
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter]
  );

  const handleApprove = (id) => updateFacilityRequestStatus(id, REQUEST_STATUS.APPROVED);
  const handleReject = (id, reason) =>
    updateFacilityRequestStatus(id, REQUEST_STATUS.REJECTED, { rejectionReason: reason || "Not approved by Government Official." });

  return (
    <GovShell title="Facility Requests" subtitle="Review Worker-submitted Dustbin & Public Toilet requests">
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {requests.length} requests · {requests.filter((r) => r.status === REQUEST_STATUS.PENDING).length} pending
        </p>
        <StatusFilterTabs options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <p className="font-semibold text-slate-900">No requests here</p>
          <p className="mt-1 text-sm text-slate-500">Nothing matches this filter right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((request) => (
            <RequestCard key={request.id} request={request} onApprove={handleApprove} onReject={handleReject} />
          ))}
        </div>
      )}
    </GovShell>
  );
}
