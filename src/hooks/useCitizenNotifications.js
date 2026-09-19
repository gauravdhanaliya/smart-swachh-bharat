import { useCallback, useMemo, useState } from "react";
import { useComplaints } from "./useComplaints";
import { useCitizenPreferences } from "./useCitizenPreferences";
import { getCitizenNotifications } from "../utils/citizenNotifications";

// "Last opened notifications" timestamp, kept in localStorage.
const STORAGE_KEY = "ssb_citizen_notifications_seen_v1";

function readSeenAt() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useCitizenNotifications() {
  const complaints = useComplaints();
  const { preferences } = useCitizenPreferences();
  // Captured once per mount, so the notifications page can keep showing
  // its unread dots for this visit even after markAllRead() runs.
  const [seenAt] = useState(readSeenAt);

  // The Profile "Alerts" switches feed straight in here, so turning a
  // category off removes it from the list AND from the Home bell badge.
  const notifications = useMemo(
    () => getCitizenNotifications(complaints, seenAt, preferences),
    [complaints, seenAt, preferences]
  );
  const unreadCount = notifications.filter((n) => n.unread).length;

  const markAllRead = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // storage blocked — badge simply won't clear across visits
    }
  }, []);

  return { notifications, unreadCount, markAllRead };
}
