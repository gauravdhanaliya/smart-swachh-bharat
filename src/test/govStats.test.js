import { describe, expect, it } from "vitest";
import { computeWorkerStats } from "../utils/govStats";

const task = (id, status, workerId = "w1", priority = "MEDIUM") => ({ id, status, assignedWorkerId: workerId, priority });

describe("computeWorkerStats", () => {
  it("'Assigned Tasks' counts every task given to the worker, 'New' only the untouched ones", () => {
    const stats = computeWorkerStats(
      [task("a", "ASSIGNED"), task("b", "IN_PROGRESS", "w1", "HIGH"), task("c", "RESOLVED"), task("d", "ASSIGNED", "w2"), task("e", "SUBMITTED", null)],
      "w1"
    );
    expect(stats).toMatchObject({ assignedCount: 3, newCount: 1, inProgressCount: 1, completedCount: 1, highPriorityCount: 1 });
    expect(stats.active.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("is all zeros with no tasks", () => {
    expect(computeWorkerStats([], "w1")).toMatchObject({ assignedCount: 0, newCount: 0, inProgressCount: 0, completedCount: 0, highPriorityCount: 0 });
  });
});
