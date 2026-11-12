import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useComplaints } from "./useComplaints";
import { useCitizenPreferences } from "./useCitizenPreferences";
import { getCitizenNotifications, timeAgo } from "../utils/citizenNotifications";
import { apiEnabled } from "../services/apiConfig";
import * as remote from "../services/notificationRemote";

// "Last opened notifications" timestamp, kept in localStorage (browser-only build).
const STORAGE_KEY = "ssb_citizen_notifications_seen_v1";

function readSeenAt() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// The Profile "Alerts" switches: resolved notices vs every other update.
function allowedBy(preferences, status) {
  return status === "RESOLVED" ? (preferences?.resolutionAlerts ?? true) : (preferences?.complaintUpdates ?? true);
}

/**
 * Through the API: the notifications the server created, read and marked on
 * the server. Unread dots stay for this visit even after "mark all read".
 */
function useServerNotifications() {
  const { preferences } = useCitizenPreferences();
  const [snapshot, setSnapshot] = useState(() => ({ ...remote.getState() }));
  const unreadThisVisit = useRef(new Set());

  useEffect(() => remote.subscribe(() => setSnapshot({ ...remote.getState() })), []);

  const notifications = useMemo(() => {
    for (const n of snapshot.items) if (!n.readAt) unreadThisVisit.current.add(n.id);
    return snapshot.items
      .filter((n) => n.kind !== "complaint" || allowedBy(preferences, n.status))
      .map((n) => ({
        key: n.id,
        complaintId: n.complaintId,
        status: n.status,
        message: n.message,
        detail: n.detail,
        iso: n.createdAt,
        time: timeAgo(n.createdAt),
        unread: !n.readAt || unreadThisVisit.current.has(n.id),
      }));
  }, [snapshot, preferences]);

  const unreadCount = snapshot.items.filter((n) => !n.readAt && (n.kind !== "complaint" || allowedBy(preferences, n.status))).length;
  const markAllRead = useCallback(() => {
    remote.markAllRead().catch(() => {
      // offline: they stay unread and are marked next time
    });
  }, []);

  return { notifications, unreadCount, markAllRead };
}

/** Browser-only build: notices worked out from the complaints on this device. */
function useLocalNotifications() {
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

// Which one is fixed for the lifetime of the app (VITE_USE_API is build-time).
export function useCitizenNotifications() {
  return apiEnabled() ? useServerNotifications() : useLocalNotifications();
}
