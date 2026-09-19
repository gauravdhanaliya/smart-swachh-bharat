import { useEffect, useState } from "react";
import {
  getFacilityRequests,
  getFacilityRequestsForWorker,
  subscribe,
} from "../services/facilityRequestService";

/** All facility requests, live-updating whenever a worker creates one. */
export function useFacilityRequests() {
  const [requests, setRequests] = useState(() => getFacilityRequests());

  useEffect(() => {
    const unsubscribe = subscribe(() => setRequests(getFacilityRequests()));
    return unsubscribe;
  }, []);

  return requests;
}

/** Only the requests raised by one worker (used by "My Facility Requests"). */
export function useFacilityRequestsForWorker(workerId) {
  const [requests, setRequests] = useState(() => getFacilityRequestsForWorker(workerId));

  useEffect(() => {
    setRequests(getFacilityRequestsForWorker(workerId));
    const unsubscribe = subscribe(() => setRequests(getFacilityRequestsForWorker(workerId)));
    return unsubscribe;
  }, [workerId]);

  return requests;
}

/** A single facility request by id, live-updating as its status changes. */
export function useFacilityRequest(id) {
  const requests = useFacilityRequests();
  return requests.find((r) => r.id === id) ?? null;
}
