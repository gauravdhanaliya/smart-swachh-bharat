// The test fakes themselves: delays settle in due-time order, and the fake
// server notices the one thing that signs a user out everywhere.
import { describe, expect, it } from "vitest";
import { createChannelBus, createFakeAuthServer, later } from "./fakeAuthServer";

const busyWait = (ms) => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // block the event loop, so several delays expire together
  }
};

describe("simulated delays", () => {
  // Plain setTimeout would give A, C, B here: Node runs every expired 15 ms
  // timer before any expired 2 ms one, even one that was due earlier. That is
  // what made "only one tab refreshes" flaky (worse on Windows' ~15.6 ms ticks).
  it("settle strictly in due-time order, even when several expire together", async () => {
    const order = [];
    const a = later(15).then(() => order.push("A")); // due at 15
    busyWait(14);
    const b = later(2).then(() => order.push("B")); // due at ~16
    const c = later(15).then(() => order.push("C")); // due at ~29
    busyWait(40); // all three are overdue now
    await Promise.all([a, b, c]);
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("each one's follow-up work runs before the next settles", async () => {
    const order = [];
    const a = later(1).then(() => {
      order.push("A");
      return Promise.resolve().then(() => order.push("A's follow-up"));
    });
    const b = later(1).then(() => order.push("B"));
    await Promise.all([a, b]);
    expect(order).toEqual(["A", "A's follow-up", "B"]);
  });
});

describe("the server and the channel share that order", () => {
  // The exact shape of the old flake: a response, then a message between
  // tabs posted a little later but due long before a second response.
  it("a message due before a response arrives before it", async () => {
    const server = createFakeAuthServer({ latencyMs: 15 });
    const bus = createChannelBus({ delayMs: 2 });
    const tabA = bus("auth");
    const tabB = bus("auth");
    const order = [];
    tabB.addEventListener("message", (e) => order.push(e.data));
    const first = server.fetch("/api/data").then(() => order.push("response 1")); // due at 15
    busyWait(14);
    tabA.postMessage("message"); // due at ~16
    const second = server.fetch("/api/data").then(() => order.push("response 2")); // due at ~29
    busyWait(40);
    await Promise.all([first, second]);
    await later(0);
    expect(order).toEqual(["response 1", "message", "response 2"]);
  });
});

describe("fake auth server", () => {
  it("records two refreshes in flight at once, and a reused cookie", async () => {
    const server = createFakeAuthServer({ latencyMs: 5 });
    server.signInEarlier("demo-citizen");
    const refresh = () => server.fetch("/api/auth/refresh", { method: "POST", headers: { "X-EcoSetu-Client": "web" } });
    expect(server.reuseDetected()).toBe(false);
    const [first, second] = await Promise.all([refresh(), refresh()]); // both carry the same cookie
    expect([first.status, second.status].sort()).toEqual([200, 401]);
    expect(server.maxConcurrentRefreshes()).toBe(2);
    expect(server.reuseDetected()).toBe(true);
    expect(server.hasLiveSession()).toBe(false); // everyone signed out
  });
});
