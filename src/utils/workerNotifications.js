import { STATUS } from "../data/complaints";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Simple prototype notification feed for the Worker role (Step 6),
 * derived entirely from the shared complaint store — no separate
 * notifications system, per the spec.
 */
export function getWorkerNotifications(complaints, workerId) {
  const mine = complaints.filter((c) => c.assignedWorkerId === workerId);
  const items = [];

  for (const c of mine) {
    if (c.status === STATUS.ASSIGNED) {
      items.push({
        key: `${c.id}-assigned`,
        complaintId: c.id,
        message: "New complaint assigned to you",
        detail: `${c.id} · ${c.issueType} at ${c.location.address}`,
        iso: c.updatedAt,
        unread: true,
      });
    }
    if (c.priority === "HIGH" && (c.status === STATUS.ASSIGNED || c.status === STATUS.IN_PROGRESS)) {
      items.push({
        key: `${c.id}-priority`,
        complaintId: c.id,
        message: `Complaint ${c.id} is high priority`,
        detail: c.issueType,
        iso: c.updatedAt,
        unread: true,
      });
    }
    if (c.status === STATUS.RESOLVED) {
      items.push({
        key: `${c.id}-resolved`,
        complaintId: c.id,
        message: `Complaint ${c.id} marked resolved`,
        detail: c.issueType,
        iso: c.resolvedAt ?? c.updatedAt,
        unread: false,
      });
    }
  }

  return items
    .sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime())
    .map((item) => ({ ...item, time: timeAgo(item.iso) }));
}

export function countUnreadWorkerNotifications(complaints, workerId) {
  return getWorkerNotifications(complaints, workerId).filter((n) => n.unread).length;
}
