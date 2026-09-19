import { useCallback, useEffect, useState } from "react";
import {
  getAllWorkers,
  addWorker as addWorkerToStore,
  removeWorker as removeWorkerFromStore,
  subscribe,
} from "../services/workerService";

/** The Government worker directory (demo + added staff), live-updating
 * whenever a worker is added or removed. */
export function useWorkers() {
  const [workers, setWorkers] = useState(() => getAllWorkers());

  useEffect(() => {
    const unsubscribe = subscribe(() => setWorkers(getAllWorkers()));
    return unsubscribe;
  }, []);

  const addWorker = useCallback((data) => addWorkerToStore(data), []);
  const removeWorker = useCallback(
    (worker, options) => removeWorkerFromStore(worker, options),
    []
  );

  return { workers, addWorker, removeWorker };
}
