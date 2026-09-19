import { STATUS } from "../data/complaints";

export function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Citizen notification feed, derived entirely from the shared complaint
 * store (same approach as workerNotifications.js — no separate
 * notifications system). One entry per complaint, describing its latest
 * status. `seenAt` is an ISO timestamp (or null): anything updated after
 * it is unread.
 *
 * `preferences` (from hooks/useCitizenPreferences.js) decides which
 * categories make it into the feed at all — `resolutionAlerts` covers
 * the "resolved" entries, `complaintUpdates` covers everything else.
 * Omit it and nothing is filtered.
 */
export function getCitizenNotifications(complaints, seenAt, preferences) {
  const seenMs = seenAt ? new Date(seenAt).getTime() : 0;
  const allowResolved = preferences?.resolutionAlerts ?? true;
  const allowUpdates = preferences?.complaintUpdates ?? true;

  return complaints
    .filter((c) => (c.status === STATUS.RESOLVED ? allowResolved : allowUpdates))
    .map((c) => {
      const worker = c.assignedWorkerName;
      let message;
      let detail = `${c.id} · ${c.issueType} at ${c.location?.address ?? "your area"}`;

      switch (c.status) {
        case STATUS.RESOLVED:
          message = `Complaint ${c.id} has been resolved`;
          if (c.resolutionNote) detail = c.resolutionNote;
          break;
        case STATUS.IN_PROGRESS:
          message = worker ? `${worker} is working on complaint ${c.id}` : `Work has started on complaint ${c.id}`;
          break;
        case STATUS.ASSIGNED:
          message = worker ? `Complaint ${c.id} assigned to ${worker}` : `Complaint ${c.id} has been assigned`;
          break;
        default:
          message = `Complaint ${c.id} received`;
      }

      const iso = c.updatedAt ?? c.createdAt;
      return {
        key: `${c.id}-${c.status}`,
        complaintId: c.id,
        status: c.status,
        message,
        detail,
        iso,
        time: timeAgo(iso),
        unread: new Date(iso).getTime() > seenMs,
      };
    })
    .sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime());
}
