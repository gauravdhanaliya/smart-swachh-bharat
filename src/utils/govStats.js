import { STATUS } from "../data/complaints";
import { BIN_STATUS } from "../data/bins";

export function computeComplaintStats(complaints) {
  const byStatus = (status) => complaints.filter((c) => c.status === status).length;
  return {
    total: complaints.length,
    submitted: byStatus(STATUS.SUBMITTED),
    assigned: byStatus(STATUS.ASSIGNED),
    inProgress: byStatus(STATUS.IN_PROGRESS),
    resolved: byStatus(STATUS.RESOLVED),
    toiletIssues: complaints.filter((c) => c.issueType === "Public Toilet Issue").length,
  };
}

export function computeBinStats(bins) {
  return {
    total: bins.length,
    overflowing: bins.filter((b) => b.status === BIN_STATUS.OVERFLOW).length,
    almostFull: bins.filter((b) => b.status === BIN_STATUS.ALMOST_FULL).length,
    normal: bins.filter((b) => b.status === BIN_STATUS.NORMAL).length,
  };
}

export function countComplaintsForWorker(complaints, workerId) {
  return complaints.filter((c) => c.assignedWorkerId === workerId).length;
}

// Step 6 — Worker Dashboard KPI tiles, all scoped to one worker's own
// complaints (never the whole city's, unlike the Government stats above).
export function computeWorkerStats(complaints, workerId) {
  const mine = complaints.filter((c) => c.assignedWorkerId === workerId);
  const assigned = mine.filter((c) => c.status === STATUS.ASSIGNED);
  const inProgress = mine.filter((c) => c.status === STATUS.IN_PROGRESS);
  const resolved = mine.filter((c) => c.status === STATUS.RESOLVED);
  const active = [...assigned, ...inProgress];

  return {
    mine,
    active,
    assignedCount: assigned.length,
    newCount: assigned.length,
    inProgressCount: inProgress.length,
    completedCount: resolved.length,
    highPriorityCount: active.filter((c) => c.priority === "HIGH").length,
  };
}
