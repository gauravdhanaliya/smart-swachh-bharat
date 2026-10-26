import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { getCitizenNotifications } from "../utils/citizenNotifications";
import { countUnreadWorkerNotifications, getWorkerNotifications } from "../utils/workerNotifications";
import { useCitizenNotifications } from "../hooks/useCitizenNotifications";
import { assignComplaint, createComplaint, getComplaints, updateComplaintStatus } from "../services/complaintService";
import { STATUS } from "../data/complaints";

const input = {
  citizenName: "Asha",
  issueType: "Overflowing Bin",
  description: "Bin near the gate is overflowing",
  location: { address: "Main Gate", latitude: 29.88, longitude: 77.95 },
  priority: "HIGH",
};

describe("citizen notifications", () => {
  it("a new complaint creates an unread 'received' notification", () => {
    const c = createComplaint(input);
    const n = getCitizenNotifications(getComplaints(), null).find((x) => x.complaintId === c.id);
    expect(n).toMatchObject({ message: `Complaint ${c.id} received`, unread: true });
  });

  it("status changes update the message", () => {
    const c = createComplaint(input);
    assignComplaint(c.id, "w1", "Vikash Kumar");
    let n = getCitizenNotifications(getComplaints(), null).find((x) => x.complaintId === c.id);
    expect(n.message).toBe(`Complaint ${c.id} assigned to Vikash Kumar`);
    updateComplaintStatus(c.id, STATUS.RESOLVED, { resolutionNote: "Cleared" });
    n = getCitizenNotifications(getComplaints(), null).find((x) => x.complaintId === c.id);
    expect(n).toMatchObject({ message: `Complaint ${c.id} has been resolved`, detail: "Cleared" });
  });

  it("preferences filter categories out", () => {
    const c = createComplaint(input);
    updateComplaintStatus(c.id, STATUS.RESOLVED);
    const list = getCitizenNotifications(getComplaints(), null, { resolutionAlerts: false, complaintUpdates: true });
    expect(list.some((x) => x.complaintId === c.id)).toBe(false);
  });

  it("markAllRead clears the unread count on the next visit", () => {
    createComplaint(input);
    const first = renderHook(() => useCitizenNotifications());
    expect(first.result.current.unreadCount).toBeGreaterThan(0);
    act(() => first.result.current.markAllRead());
    first.unmount();

    const next = renderHook(() => useCitizenNotifications());
    expect(next.result.current.unreadCount).toBe(0);
  });
});

describe("worker notifications", () => {
  it("assigning a complaint notifies that worker only", () => {
    const before = countUnreadWorkerNotifications(getComplaints(), "w1");
    const c = createComplaint(input);
    assignComplaint(c.id, "w1", "Vikash Kumar");
    const mine = getWorkerNotifications(getComplaints(), "w1").filter((n) => n.complaintId === c.id);
    expect(mine.map((n) => n.message)).toEqual(
      expect.arrayContaining(["New complaint assigned to you", `Complaint ${c.id} is high priority`])
    );
    expect(countUnreadWorkerNotifications(getComplaints(), "w1")).toBe(before + 2);
    expect(getWorkerNotifications(getComplaints(), "w2").some((n) => n.complaintId === c.id)).toBe(false);
  });
});
