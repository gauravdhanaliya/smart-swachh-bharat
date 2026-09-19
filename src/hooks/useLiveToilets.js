import { useEffect, useState } from "react";
import { getAllToilets, subscribe as subscribeFacilities } from "../services/facilityService";

// Step 14D — toilets now come from the shared facility store (demo +
// Government-added + Government-approved Worker requests) instead of the
// static `toilets` array, and update live when Government adds one or a
// Worker request gets approved.
const REFRESH_POLL_MS = 8000; // safety-net poll per bug-fix spec §7 (5–10s)

export function useLiveToilets() {
  const [toilets, setToilets] = useState(() => getAllToilets());

  useEffect(() => {
    const refresh = () => setToilets(getAllToilets());
    const unsubscribe = subscribeFacilities(refresh);
    const poll = setInterval(refresh, REFRESH_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, []);

  return toilets;
}
