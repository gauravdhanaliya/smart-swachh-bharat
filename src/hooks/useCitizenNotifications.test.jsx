// Citizen/worker notifications (ported from main's 7cef7da notifications.test,
// rewritten for the seeded demo data) and the mode-independent hook order of
// useCitizenNotifications.
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as remote from "../services/notificationRemote";
import * as complaintService from "../services/complaintService";
import { useCitizenNotifications } from "./useCitizenNotifications";
import { getCitizenNotifications } from "../utils/citizenNotifications";
import { countUnreadWorkerNotifications, getWorkerNotifications } from "../utils/workerNotifications";
import { STATUS } from "../data/complaints";

const { assignComplaint, createComplaint, getComplaints, updateComplaintStatus } = complaintService;

const input = {
  citizenName: "Asha",
  issueType: "Overflowing Bin",
  description: "Bin near the gate is overflowing",
  location: { address: "Main Gate", latitude: 29.88, longitude: 77.95 },
  priority: "HIGH",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  remote.reset();
});

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

  it("a complaint filed while the hook is mounted shows up live", () => {
    const { result } = renderHook(() => useCitizenNotifications());
    const before = result.current.notifications.length;
    let c;
    act(() => {
      c = createComplaint(input);
    });
    expect(result.current.notifications).toHaveLength(before + 1);
    expect(result.current.notifications.some((n) => n.complaintId === c.id)).toBe(true);
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

describe("useCitizenNotifications in either build", () => {
  const SERVER_ITEM = {
    id: "n1",
    kind: "complaint",
    complaintId: "SSB2026-0999",
    status: "ASSIGNED",
    message: "Complaint SSB2026-0999 assigned to Vikash Kumar",
    detail: "",
    createdAt: new Date().toISOString(),
    readAt: null,
  };

  // Puts one unread notification in the server-side store without a network call.
  function seedServerStore() {
    Object.assign(remote.getState(), { items: [SERVER_ITEM], unread: 1, loaded: true, error: null });
  }

  function Bell() {
    const { notifications, unreadCount } = useCitizenNotifications();
    return (
      <p>
        {unreadCount} unread · {notifications.map((n) => n.message).join(" | ")}
      </p>
    );
  }

  beforeEach(() => {
    // The poller in server mode would otherwise fetch; tests stay offline.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  });

  it("the browser-only build never subscribes to (or polls) the server store", () => {
    vi.stubEnv("VITE_USE_API", "false");
    const serverSubscribe = vi.spyOn(remote, "subscribe");
    const { unmount } = renderHook(() => useCitizenNotifications());
    expect(serverSubscribe).not.toHaveBeenCalled();
    unmount();
  });

  it("the API build never subscribes to the local complaint store", () => {
    vi.stubEnv("VITE_USE_API", "true");
    seedServerStore();
    const localSubscribe = vi.spyOn(complaintService, "subscribe");
    const serverSubscribe = vi.spyOn(remote, "subscribe");
    const { result, unmount } = renderHook(() => useCitizenNotifications());
    expect(localSubscribe).not.toHaveBeenCalled();
    expect(serverSubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.unreadCount).toBe(1);
    unmount();
  });

  it("switching VITE_USE_API while mounted keeps the hook order and doesn't crash", () => {
    const errors = vi.spyOn(console, "error");
    vi.stubEnv("VITE_USE_API", "false");
    const local = createComplaint(input);
    seedServerStore();
    const view = render(<Bell />);
    expect(view.container).toHaveTextContent(`Complaint ${local.id} received`);
    expect(view.container).not.toHaveTextContent("SSB2026-0999");

    vi.stubEnv("VITE_USE_API", "true");
    view.rerender(<Bell />);
    expect(screen.getByText(/1 unread · Complaint SSB2026-0999 assigned to Vikash Kumar$/)).toBeInTheDocument();
    expect(view.container).not.toHaveTextContent(`Complaint ${local.id} received`);

    vi.stubEnv("VITE_USE_API", "false");
    view.rerender(<Bell />);
    expect(view.container).toHaveTextContent(`Complaint ${local.id} received`);
    expect(view.container).not.toHaveTextContent("SSB2026-0999");

    // React reports a changed hook order (or any render error) through console.error.
    expect(errors).not.toHaveBeenCalled();
    view.unmount();
  });

  it("after switching, updates come from the newly selected store only", () => {
    vi.stubEnv("VITE_USE_API", "true");
    seedServerStore();
    const view = render(<Bell />);
    vi.stubEnv("VITE_USE_API", "false");
    view.rerender(<Bell />);

    // A local complaint now updates the bell…
    let c;
    act(() => {
      c = createComplaint(input);
    });
    expect(view.container).toHaveTextContent(`Complaint ${c.id} received`);
    // …and the server store, no longer subscribed, doesn't leak back in.
    act(() => {
      remote.reset();
      seedServerStore();
    });
    expect(view.container).not.toHaveTextContent("SSB2026-0999");
    view.unmount();
  });
});
