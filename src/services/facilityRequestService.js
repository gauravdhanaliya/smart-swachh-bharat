// Worker "Request Facility" data — backed by the EcoSetu API.
//
//   POST  /api/facility-requests               (worker / supervisor)
//   GET   /api/facility-requests               (workers see their own; reviewers see all)
//   PATCH /api/facility-requests/:id/status    (official approves/rejects; supervisor may mark under review)
//
// Reads are synchronous against the synced cache (locationStore.js);
// writes return Promises and reject with an ApiError on failure. An
// approved request is published as a real location by the server, in the
// same transaction, so it appears on every role's map after the next
// refresh.

import { api } from "./api";
import { REQUEST_STATUS } from "../data/facilityRequests";
import { getRequestsSnapshot, refreshFresh, subscribe as subscribeStore } from "./locationStore";

const byNewest = (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

/** All requests visible to the signed-in role, newest first. */
export function getFacilityRequests() {
  return [...getRequestsSnapshot()].sort(byNewest);
}

/** Requests raised by one worker (used by "My Facility Requests"). */
export function getFacilityRequestsForWorker(workerId) {
  return getFacilityRequests().filter((r) => r.requestedByWorkerId === workerId);
}

export function getFacilityRequestById(id) {
  return getRequestsSnapshot().find((r) => r.id === id) ?? null;
}

/** POST /api/facility-requests. `data` should already be validated by the form. */
export async function createFacilityRequest(data) {
  const { request } = await api("/facility-requests", {
    method: "POST",
    body: {
      facilityType: data.facilityType,
      suggestedName: data.suggestedName,
      location: data.location,
      reason: data.reason,
      description: data.description ?? "",
      priority: data.priority,
      photo: data.photo ?? null,
      requestedByWorkerId: data.requestedByWorkerId,
      requestedByWorkerName: data.requestedByWorkerName,
    },
  });
  await refreshFresh();
  return request;
}

/** PATCH /api/facility-requests/:id/status. Rejects if the role isn't allowed. */
export async function updateFacilityRequestStatus(id, status, extra = {}) {
  const body = { status };
  if (status === REQUEST_STATUS.REJECTED) body.rejectionReason = extra.rejectionReason ?? "";
  const result = await api(`/facility-requests/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body,
  });
  await refreshFresh(); // an approval also adds a location, so refresh both lists
  return result.request;
}

export function subscribe(callback) {
  return subscribeStore(callback);
}
