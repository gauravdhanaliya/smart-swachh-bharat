// The browser-only complaint store (ported from main's 7cef7da
// complaintService.test, rewritten for the seeded demo complaints).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignComplaint,
  createComplaint,
  getComplaintById,
  getComplaints,
  subscribe,
  updateComplaintStatus,
} from "./complaintService";
import { SEED_COMPLAINTS, STATUS } from "../data/complaints";
import { complaintIdPrefix } from "../../server/src/ids.js";

const STORAGE_KEY = "ssb_complaints_v1";

const input = {
  citizenName: "Asha",
  issueType: "Overflowing Bin",
  description: "Bin near the gate is overflowing",
  location: { address: "Main Gate", latitude: 29.88, longitude: 77.95 },
  priority: "HIGH",
};

const PREFIX = complaintIdPrefix(new Date());
const seq = (id) => Number(id.slice(PREFIX.length));

afterEach(() => {
  vi.useRealTimers();
});

describe("complaintService (browser-only build)", () => {
  it("starts with the seeded demo complaints and saves them on first read", () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getComplaints().map((c) => c.id).sort()).toEqual(SEED_COMPLAINTS.map((c) => c.id).sort());
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toHaveLength(SEED_COMPLAINTS.length);
  });

  it("numbers a new complaint after the highest one this year, and lists newest first", async () => {
    const highest = Math.max(0, ...getComplaints().filter((c) => c.id.startsWith(PREFIX)).map((c) => seq(c.id)));
    const first = createComplaint(input);
    await new Promise((r) => setTimeout(r, 5));
    const second = createComplaint(input);
    expect(first.id).toBe(`${PREFIX}${String(highest + 1).padStart(4, "0")}`);
    expect(seq(second.id)).toBe(highest + 2);
    expect(getComplaints().slice(0, 2).map((c) => c.id)).toEqual([second.id, first.id]);
  });

  it("creates a complaint as SUBMITTED, unassigned, and lists it first", () => {
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
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.some((c) => c.id === created.id)).toBe(true);
  });

  it("assigns and updates status, bumping updatedAt", async () => {
    const created = createComplaint(input);
    await new Promise((r) => setTimeout(r, 5));
    const assigned = assignComplaint(created.id, "w1", "Vikash Kumar");
    expect(assigned).toMatchObject({ status: STATUS.ASSIGNED, assignedWorkerId: "w1", assignedWorkerName: "Vikash Kumar" });
    expect(Date.parse(assigned.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));

    const resolved = updateComplaintStatus(created.id, STATUS.RESOLVED, { resolutionNote: "Cleared" });
    expect(resolved).toMatchObject({ status: STATUS.RESOLVED, resolutionNote: "Cleared" });
    expect(getComplaintById(created.id).status).toBe(STATUS.RESOLVED);
  });

  it("notifies subscribers on create and update, and stops after unsubscribing", () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    const created = createComplaint(input);
    updateComplaintStatus(created.id, STATUS.IN_PROGRESS);
    off();
    createComplaint(input);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("in 2027 a new complaint gets an SSB2027- id numbered from 0001; 2026 ids stay as they were", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-02-10T09:00:00+05:30"));
    const before = getComplaints().map((c) => c.id);
    const a = createComplaint(input);
    const b = createComplaint(input);
    expect([a.id, b.id]).toEqual(["SSB2027-0001", "SSB2027-0002"]);
    expect(getComplaints().filter((c) => before.includes(c.id)).map((c) => c.id).sort()).toEqual([...before].sort());
    expect(before.every((id) => id.startsWith("SSB2026-"))).toBe(true);
  });

  it("the year is India's: 00:30 on 1 January IST is already the new year", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T19:00:00Z")); // 00:30 IST, 1 Jan 2027
    expect(createComplaint(input).id).toBe("SSB2027-0001");
  });

  it("an unknown id reads as null", () => {
    expect(getComplaintById("SSB1999-9999")).toBeNull();
  });
});
