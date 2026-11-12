import { useEffect, useState } from "react";
import { getOpenComplaintCount, subscribe } from "../services/complaintService";

/** How many reports about this bin or toilet are still open (null until known). */
export function useOpenComplaintCount(facilityId) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    if (!facilityId) return undefined;
    let live = true;
    const load = () =>
      getOpenComplaintCount(facilityId)
        .then((n) => live && setCount(n))
        .catch(() => {}); // the page works without it
    load();
    const off = subscribe(load); // a new or resolved report changes it
    return () => {
      live = false;
      off();
    };
  }, [facilityId]);
  return count;
}
