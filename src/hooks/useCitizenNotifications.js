import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getComplaints, subscribe as subscribeComplaints } from "../services/complaintService";
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

const NO_ITEMS = [];

/**
 * What `read()` returns from a store, kept up to date through `subscribe`
 * while `enabled`. A disabled store is never subscribed to (so it never starts
 * polling or listening) and reads as empty; if `enabled` flips while mounted,
 * the snapshot is re-read during that render.
 */
function useStoreSnapshot(subscribe, read, enabled) {
  const [snap, setSnap] = useState(() => ({ enabled, data: enabled ? read() : NO_ITEMS }));
  if (snap.enabled !== enabled) setSnap({ enabled, data: enabled ? read() : NO_ITEMS });
  useEffect(() => (enabled ? subscribe(() => setSnap({ enabled: true, data: read() })) : undefined), [subscribe, read, enabled]);
  return snap.enabled === enabled ? snap.data : NO_ITEMS;
}

const readServerItems = () => remote.getState().items;

/**
 * Through the API: the notifications the server created, read and marked on
 * the server. Unread dots stay for this visit even after "mark all read".
 * Inert (no polling, nothing listed) while `enabled` is false.
 */
function useServerNotifications(enabled, preferences) {
  const items = useStoreSnapshot(remote.subscribe, readServerItems, enabled);
  const unreadThisVisit = useRef(new Set());

  const notifications = useMemo(() => {
    for (const n of items) if (!n.readAt) unreadThisVisit.current.add(n.id);
    return items
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
  }, [items, preferences]);

  const unreadCount = items.filter((n) => !n.readAt && (n.kind !== "complaint" || allowedBy(preferences, n.status))).length;
  const markAllRead = useCallback(() => {
    remote.markAllRead().catch(() => {
      // offline: they stay unread and are marked next time
    });
  }, []);

  return { notifications, unreadCount, markAllRead };
}

/**
 * Browser-only build: notices worked out from the complaints on this device.
 * Inert (reads and lists nothing) while `enabled` is false.
 */
function useLocalNotifications(enabled, preferences) {
  const complaints = useStoreSnapshot(subscribeComplaints, getComplaints, enabled);
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

/**
 * The citizen's notifications, from the server (VITE_USE_API=true) or worked
 * out locally. Both hooks run on every render, so the hook order never
 * depends on the mode; only the selected one subscribes to anything.
 */
export function useCitizenNotifications() {
  const { preferences } = useCitizenPreferences();
  const useApi = apiEnabled();
  const server = useServerNotifications(useApi, preferences);
  const local = useLocalNotifications(!useApi, preferences);
  return useApi ? server : local;
}
