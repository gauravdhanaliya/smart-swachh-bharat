import { describe, expect, it, vi } from "vitest";
import {
  assignComplaint,
  createComplaint,
  getComplaintById,
  getComplaints,
  subscribe,
  updateComplaintStatus,
} from "../services/complaintService";
import { STATUS } from "../data/complaints";

const input = {
  citizenName: "Asha",
  issueType: "Overflowing Bin",
  description: "Bin near the gate is overflowing",
  location: { address: "Main Gate", latitude: 29.88, longitude: 77.95 },
  priority: "HIGH",
};

describe("complaintService", () => {
  it("starts empty, numbers complaints from 0001 for the current year, newest first", async () => {
    expect(getComplaints()).toEqual([]);
    expect(localStorage.getItem("ssb_complaints_v1")).toBeNull();
    const first = createComplaint(input);
    await new Promise((r) => setTimeout(r, 5));
    const second = createComplaint(input);
    expect(first.id).toBe(`SSB${new Date().getFullYear()}-0001`);
    expect(getComplaints().map((c) => c.id)).toEqual([second.id, first.id]);
  });

  it("creates a complaint as SUBMITTED with a new id and lists it first", () => {
    const created = createComplaint(input);
    expect(created).toMatchObject({ ...input, status: STATUS.SUBMITTED, assignedWorkerId: null });
    expect(getComplaints()[0].id).toBe(created.id);
    expect(getComplaintById(created.id)).toEqual(created);
  });

  it("gives every new complaint a unique id", () => {
    const a = createComplaint(input);
    const b = createComplaint(input);
    expect(a.id).not.toBe(b.id);
  });

  it("persists across reloads (stored in localStorage)", () => {
    const created = createComplaint(input);
    const stored = JSON.parse(localStorage.getItem("ssb_complaints_v1"));
    expect(stored.some((c) => c.id === created.id)).toBe(true);
  });

  it("assigns and updates status, bumping updatedAt", async () => {
    const created = createComplaint(input);
    await new Promise((r) => setTimeout(r, 5));
    const assigned = assignComplaint(created.id, "w1", "Vikash Kumar");
    expect(assigned).toMatchObject({ status: STATUS.ASSIGNED, assignedWorkerId: "w1" });
    expect(Date.parse(assigned.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));

    const resolved = updateComplaintStatus(created.id, STATUS.RESOLVED, { resolutionNote: "Cleared" });
    expect(resolved).toMatchObject({ status: STATUS.RESOLVED, resolutionNote: "Cleared" });
    expect(getComplaintById(created.id).status).toBe(STATUS.RESOLVED);
  });

  it("notifies subscribers on create and update", () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    const created = createComplaint(input);
    updateComplaintStatus(created.id, STATUS.IN_PROGRESS);
    off();
    createComplaint(input);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
