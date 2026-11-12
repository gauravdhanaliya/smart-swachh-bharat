import { useEffect, useState } from "react";
import { getComplaints, getComplaintsStatus, refreshComplaints, subscribe } from "../services/complaintService";

/** All complaints, live-updating whenever any role creates/changes one. */
export function useComplaints() {
  const [complaints, setComplaints] = useState(() => getComplaints());

  useEffect(() => {
    const unsubscribe = subscribe(() => setComplaints(getComplaints()));
    return unsubscribe;
  }, []);

  return complaints;
}

/** { loaded, error, retry } for the complaint list (always loaded in the browser-only build). */
export function useComplaintsStatus() {
  const [status, setStatus] = useState(getComplaintsStatus);
  useEffect(() => subscribe(() => setStatus(getComplaintsStatus())), []);
  return { ...status, retry: refreshComplaints };
}

/** A single complaint by id, live-updating as its status changes. */
export function useComplaint(id) {
  const complaints = useComplaints();
  return complaints.find((c) => c.id === id) ?? null;
}
