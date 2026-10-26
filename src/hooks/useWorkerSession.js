import { useEffect, useState } from "react";
import { getRegisteredWorker, subscribe } from "../services/workerService";
import { DEMO_USERS } from "../services/authSession";

// The sanitation worker signed in on this device, as the directory sees
// them (built from their saved profile — services/workerService.js). The
// fallback only shows for the moment before a profile exists; RequireRole
// sends a worker without a profile to the setup screen.
const FALLBACK = { id: DEMO_USERS.worker.id, displayId: "", name: "Sanitation Worker", role: "Sanitation Worker", area: "", status: "Available", phone: "" };

export function useWorkerSession() {
  const [worker, setWorker] = useState(() => getRegisteredWorker() ?? FALLBACK);

  useEffect(() => subscribe(() => setWorker(getRegisteredWorker() ?? FALLBACK)), []);

  return { workerId: worker.id, worker };
}
