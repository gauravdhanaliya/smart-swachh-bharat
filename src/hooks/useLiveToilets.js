import { useSyncExternalStore } from "react";
import { getAllToilets, subscribe as subscribeFacilities } from "../services/facilityService";

// Step 14D — toilets now come from the shared facility store (demo +
// Government-added + Government-approved Worker requests) instead of the
// static `toilets` array, and update live when Government adds one or a
// Worker request gets approved.

export function useLiveToilets() {
  // Re-read as it subscribes (useSyncExternalStore), so no update is missed
  // between the first render and the subscription; see useLiveBins.
  return useSyncExternalStore(subscribeFacilities, getAllToilets);
}
