import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLL_MS, createPoller } from "./poller";

let visibility = "visible";
const setVisibility = (state) => {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createPoller", () => {
  it("polls every 30 seconds while the tab is visible", () => {
    expect(POLL_MS).toBe(30_000);
    const refresh = vi.fn();
    const poller = createPoller(refresh);
    poller.start();
    expect(refresh).toHaveBeenCalledTimes(1); // the first load
    vi.advanceTimersByTime(29_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(4);
    poller.stop();
  });

  it("makes no requests at all while the tab is hidden, and exactly one on return", () => {
    const refresh = vi.fn();
    const poller = createPoller(refresh);
    poller.start();
    refresh.mockClear();

    setVisibility("hidden");
    vi.advanceTimersByTime(10 * 60_000);
    expect(refresh).not.toHaveBeenCalled();

    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(29_000);
    expect(refresh).toHaveBeenCalledTimes(1, "the rhythm restarts from the return");
    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("starting in a hidden tab waits until it is shown", () => {
    visibility = "hidden";
    const refresh = vi.fn();
    const poller = createPoller(refresh);
    poller.start();
    vi.advanceTimersByTime(120_000);
    expect(refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("stop() ends polling and stops listening", () => {
    const refresh = vi.fn();
    const poller = createPoller(refresh);
    poller.start();
    poller.stop();
    refresh.mockClear();
    vi.advanceTimersByTime(120_000);
    setVisibility("hidden");
    setVisibility("visible");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("start() twice doesn't double the polling", () => {
    const refresh = vi.fn();
    const poller = createPoller(refresh);
    poller.start();
    poller.start();
    refresh.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    poller.stop();
  });
});
