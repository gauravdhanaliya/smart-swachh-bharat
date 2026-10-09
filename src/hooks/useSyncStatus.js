import { useEffect, useState } from "react";
import { getSyncStatus, refreshFresh, subscribe } from "../services/locationStore";

/** Whether the shared data has loaded, and the last sync error (if any). */
export function useSyncStatus() {
  const [status, setStatus] = useState(getSyncStatus);

  useEffect(() => {
    setStatus(getSyncStatus());
    return subscribe(() => setStatus(getSyncStatus()));
  }, []);

  return { ...status, retry: refreshFresh };
}
