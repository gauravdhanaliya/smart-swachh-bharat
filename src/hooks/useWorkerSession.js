import { useCallback, useEffect, useState } from "react";
import { WORKERS, getWorkerById } from "../data/workers";

// Step 3's Worker login is a single generic role (no per-worker auth), so
// Step 6 layers a lightweight "which demo worker am I" selection on top —
// purely a UI/demo concern, kept out of AuthContext so the real role/auth
// state from Step 1 is untouched. Persisted so a refresh mid-demo doesn't
// lose the selection.
const STORAGE_KEY = "ssb_worker_session_v1";
const DEFAULT_WORKER_ID = WORKERS[0]?.id ?? "w1";

const listeners = new Set();

function readWorkerId() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && getWorkerById(raw)) return raw;
  } catch {
    // storage unavailable — fall back to default
  }
  return DEFAULT_WORKER_ID;
}

function writeWorkerId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore — in-memory state below still updates for this session
  }
  listeners.forEach((cb) => {
    try {
      cb(id);
    } catch {
      // a misbehaving subscriber shouldn't break others
    }
  });
}

/** The demo worker currently "signed in" on this device, plus a setter
 * used by the Profile screen's worker switcher. */
export function useWorkerSession() {
  const [workerId, setWorkerIdState] = useState(readWorkerId);

  useEffect(() => {
    const onChange = (id) => setWorkerIdState(id);
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  const setWorkerId = useCallback((id) => {
    if (!getWorkerById(id)) return;
    writeWorkerId(id);
    setWorkerIdState(id);
  }, []);

  return {
    workerId,
    worker: getWorkerById(workerId) ?? WORKERS[0],
    setWorkerId,
  };
}
