import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_EXPIRED_MESSAGE, SessionExpiredError, createSessionClient } from "./session";
import { createChannelBus, createFakeAuthServer, createLockManager } from "../test/fakeAuthServer";

// Long enough for a message between tabs to arrive (the fake channel takes 2 ms).
const delivered = () => new Promise((r) => setTimeout(r, 10));

const clients = [];
function tab(server, options = {}) {
  const client = createSessionClient({ fetch: server.fetch, locks: null, createChannel: () => null, ...options });
  clients.push(client);
  return client;
}
afterEach(() => {
  while (clients.length) clients.pop().dispose();
});

describe("signing in", () => {
  it("keeps the access token in memory only and sends it as a Bearer header", async () => {
    const server = createFakeAuthServer();
    const client = tab(server);
    const session = await client.loginDemo("official");
    expect(session.user.role).toBe("official");
    expect(client.getAccessToken()).toBe(session.accessToken);
    expect(JSON.stringify({ ...localStorage })).not.toContain(session.accessToken);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(session.accessToken);

    await expect(client.request("/api/data")).resolves.toMatchObject({ ok: true, uid: "demo-official" });
    expect(server.calls.at(-1).headers.authorization).toBe(`Bearer ${session.accessToken}`);
  });

  it("the demo login sends nothing but the choice of demo user", async () => {
    const server = createFakeAuthServer();
    await tab(server).loginDemo("worker");
    expect(server.calls.at(-1).body).toEqual({ role: "worker" });
  });

  it("an email sign-in hands only the Firebase ID token to the server; the role comes back from it", async () => {
    const server = createFakeAuthServer();
    const session = await tab(server).loginFirebase("email:fb-user-1:as***@e***.test:1");
    expect(session.user).toMatchObject({ uid: "fb-user-1", role: "citizen", account: { type: "email", email: "as***@e***.test" } });
    expect(server.calls.at(-1)).toMatchObject({ path: "/api/auth/firebase", body: { idToken: "email:fb-user-1:as***@e***.test:1" } });
    expect(Object.keys(server.calls.at(-1).body)).toEqual(["idToken"]);
  });
});

describe("a. parallel 401s share one refresh", () => {
  it("five requests that all hit an expired token cause exactly one /refresh, and all succeed", async () => {
    const server = createFakeAuthServer();
    const client = tab(server);
    await client.loginDemo("citizen");
    server.expireAccessTokens();

    const results = await Promise.all(Array.from({ length: 5 }, () => client.request("/api/data")));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(server.count("/api/auth/refresh")).toBe(1);

    // and the user is still signed in afterwards
    expect(server.hasLiveSession()).toBe(true);
    await expect(client.request("/api/data")).resolves.toMatchObject({ ok: true });
    server.expireAccessTokens();
    await expect(client.request("/api/data")).resolves.toMatchObject({ ok: true });
    expect(server.count("/api/auth/refresh")).toBe(2);
  });

  it("a later 401 after the shared refresh finished starts a new refresh, not a replay", async () => {
    const server = createFakeAuthServer();
    const client = tab(server);
    await client.loginDemo("citizen");
    for (let i = 0; i < 3; i++) {
      server.expireAccessTokens();
      await Promise.all([client.request("/api/data"), client.request("/api/data")]);
    }
    expect(server.count("/api/auth/refresh")).toBe(3);
    expect(server.hasLiveSession()).toBe(true);
  });
});

describe("b. restoring on page load happens once", () => {
  it("restore() called twice at once (React StrictMode) makes one /refresh", async () => {
    const server = createFakeAuthServer();
    server.signInEarlier("demo-worker");
    const client = tab(server);
    const [a, b] = await Promise.all([client.restore(), client.restore()]);
    expect(a).toBe(b);
    expect(a.user.uid).toBe("demo-worker");
    expect(server.count("/api/auth/refresh")).toBe(1);
    expect(server.hasLiveSession()).toBe(true);
    await client.restore();
    expect(server.count("/api/auth/refresh")).toBe(1, "a later call reuses the result");
  });

  it("with no earlier session, restore resolves to null quietly, without asking the server", async () => {
    const server = createFakeAuthServer();
    const onChange = vi.fn();
    const client = tab(server);
    client.onChange(onChange);
    await expect(client.restore()).resolves.toBeNull();
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ reason: "expired" }));
    expect(server.calls).toHaveLength(0); // a first visit makes no request before the user has agreed to anything
  });
});

// What signs a user out everywhere is a refresh cookie presented twice, which
// needs two refreshes in flight at once. Every multi-tab test checks it.
function expectNoCookieReuse(server) {
  expect(server.maxConcurrentRefreshes()).toBeLessThanOrEqual(1);
  expect(server.reuseDetected()).toBe(false);
  expect(server.hasLiveSession()).toBe(true);
}

describe("c. several tabs", () => {
  async function twoTabsRace(options) {
    const server = createFakeAuthServer({ latencyMs: 15 });
    const tabA = tab(server, options());
    const tabB = tab(server, options());
    await tabA.loginDemo("citizen");
    await delivered(); // tab B hears about the login
    expect(tabB.getAccessToken()).toBe(tabA.getAccessToken());

    server.expireAccessTokens();
    const [a, b] = await Promise.all([tabA.request("/api/data"), tabB.request("/api/data")]);
    return { server, tabA, tabB, a, b };
  }

  it("with navigator.locks: only one tab refreshes and the other reuses its result", async () => {
    const locks = createLockManager();
    const createChannel = createChannelBus();
    const { server, tabA, tabB, a, b } = await twoTabsRace(() => ({ locks, createChannel }));
    expect(a.ok && b.ok).toBe(true);
    expect(server.count("/api/auth/refresh")).toBe(1);
    expect(tabA.getAccessToken()).toBe(tabB.getAccessToken());
    expectNoCookieReuse(server);
    await expect(tabB.request("/api/data")).resolves.toMatchObject({ ok: true });
  });

  it("without navigator.locks: BroadcastChannel alone still lets only one tab refresh", async () => {
    const createChannel = createChannelBus();
    const { server, tabA, tabB, a, b } = await twoTabsRace(() => ({ locks: null, createChannel }));
    expect(a.ok && b.ok).toBe(true);
    expect(server.count("/api/auth/refresh")).toBe(1);
    expect(tabA.getAccessToken()).toBe(tabB.getAccessToken());
    expectNoCookieReuse(server);
  });

  // The hardest case: both tabs start refreshing in the same instant, before
  // either can hear the other's "refreshing" announcement.
  async function sameInstant(options) {
    const server = createFakeAuthServer({ latencyMs: 15 });
    const tabA = tab(server, options());
    const tabB = tab(server, options());
    await tabA.loginDemo("citizen");
    await delivered();
    server.expireAccessTokens();
    const [a, b] = await Promise.all([tabA.refresh(), tabB.refresh()]);
    return { server, tabA, tabB, a, b };
  }

  it("with navigator.locks: two tabs refreshing in the very same instant still refresh only once", async () => {
    const locks = createLockManager();
    const createChannel = createChannelBus();
    const { server, tabA, tabB, a, b } = await sameInstant(() => ({ locks, createChannel }));
    expect(a?.accessToken).toBeTruthy();
    expect(b?.accessToken).toBe(a.accessToken);
    expect(server.count("/api/auth/refresh")).toBe(1);
    expectNoCookieReuse(server);
    await expect(tabA.request("/api/data")).resolves.toMatchObject({ ok: true });
    await expect(tabB.request("/api/data")).resolves.toMatchObject({ ok: true });
  });

  it("without navigator.locks: two tabs refreshing in the very same instant still refresh only once", async () => {
    const createChannel = createChannelBus();
    const { server, tabA, tabB, a, b } = await sameInstant(() => ({ locks: null, createChannel }));
    expect(a?.accessToken).toBeTruthy();
    expect(b?.accessToken).toBe(a.accessToken);
    expect(server.count("/api/auth/refresh")).toBe(1);
    expectNoCookieReuse(server);
    await expect(tabA.request("/api/data")).resolves.toMatchObject({ ok: true });
    await expect(tabB.request("/api/data")).resolves.toMatchObject({ ok: true });
  });

  it("with locks, tabs whose refreshes don't overlap each do their own, safely", async () => {
    const locks = createLockManager();
    const createChannel = createChannelBus();
    const server = createFakeAuthServer();
    const tabA = tab(server, { locks, createChannel });
    const tabB = tab(server, { locks, createChannel });
    await tabA.loginDemo("official");
    await delivered();
    server.expireAccessTokens();
    await tabA.request("/api/data");
    server.expireAccessTokens();
    await tabB.request("/api/data");
    expect(server.count("/api/auth/refresh")).toBe(2);
    expectNoCookieReuse(server);
  });

  // Browsers don't order a Web Lock grant against BroadcastChannel delivery:
  // the tab waiting for the lock can get it before hearing that the other tab
  // refreshed. It then can't know, so it refreshes too. That must stay safe:
  // the lock keeps the refreshes one after the other (the second sends the
  // already-rotated cookie), and the late "refreshed" message must not make
  // a tab swap its newer session for the older one.
  it("with locks and late messages between tabs: no overlap, no reused cookie, and both tabs end on the newest session", async () => {
    const locks = createLockManager();
    const createChannel = createChannelBus({ delayMs: 40 }); // slower than the server (15 ms)
    const server = createFakeAuthServer({ latencyMs: 15 });
    const tabA = tab(server, { locks, createChannel });
    const tabB = tab(server, { locks, createChannel });
    await tabA.loginDemo("citizen");
    await new Promise((r) => setTimeout(r, 80)); // the login reaches tab B
    expect(tabB.getAccessToken()).toBe(tabA.getAccessToken());

    server.expireAccessTokens();
    const [a, b] = await Promise.all([tabA.request("/api/data"), tabB.request("/api/data")]);
    expect(a.ok && b.ok).toBe(true);
    expect(server.count("/api/auth/refresh")).toBe(2); // B couldn't know A had refreshed
    expectNoCookieReuse(server);

    await new Promise((r) => setTimeout(r, 150)); // every late message has arrived
    expect(tabA.getAccessToken()).toBe(tabB.getAccessToken());
    expect(tabA.getAccessToken()).toBe(`at-${server.count("/api/auth/refresh") + 1}`); // the newest one issued
    await expect(tabA.request("/api/data")).resolves.toMatchObject({ ok: true });
    await expect(tabB.request("/api/data")).resolves.toMatchObject({ ok: true });
    expect(server.count("/api/auth/refresh")).toBe(2);
  });

  it("logging out in one tab signs the other tab out too", async () => {
    const createChannel = createChannelBus();
    const server = createFakeAuthServer();
    const tabA = tab(server, { createChannel });
    const tabB = tab(server, { createChannel });
    const onChange = vi.fn();
    tabB.onChange(onChange);
    await tabA.loginDemo("citizen");
    await delivered();
    await tabA.logout();
    await delivered();
    expect(tabB.getAccessToken()).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ user: null, reason: "logout" });
  });
});

describe("a failed refresh", () => {
  it("clears the token, rejects every waiting request, and reports the expiry once", async () => {
    const server = createFakeAuthServer();
    const client = tab(server);
    const onChange = vi.fn();
    client.onChange(onChange);
    await client.loginDemo("citizen");
    server.revokeEverything();

    const results = await Promise.allSettled([client.request("/api/data"), client.request("/api/data"), client.request("/api/data")]);
    expect(results.every((r) => r.status === "rejected" && r.reason instanceof SessionExpiredError)).toBe(true);
    expect(results[0].reason.message).toBe(SESSION_EXPIRED_MESSAGE);
    expect(client.getAccessToken()).toBeNull();
    expect(server.count("/api/auth/refresh")).toBe(1);
    const expired = onChange.mock.calls.filter(([e]) => e.reason === "expired");
    expect(expired).toEqual([[{ user: null, reason: "expired" }]]);
  });

  it("an earlier session that can't be restored on page load is reported as expired", async () => {
    const server = createFakeAuthServer();
    const first = tab(server);
    await first.loginDemo("citizen"); // leaves the "was signed in" hint
    first.dispose();
    server.revokeEverything();
    const onChange = vi.fn();
    const client = tab(server);
    client.onChange(onChange);
    await expect(client.restore()).resolves.toBeNull();
    expect(onChange).toHaveBeenCalledWith({ user: null, reason: "expired" });
  });

  it("a network failure is not a sign-out: the request fails, the session stays", async () => {
    const server = createFakeAuthServer();
    const client = tab(server);
    const onChange = vi.fn();
    client.onChange(onChange);
    await client.loginDemo("citizen");
    server.expireAccessTokens();
    server.setOffline(true);
    await expect(client.request("/api/data")).rejects.toThrow(/network|fetch/i);
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ reason: "expired" }));
    server.setOffline(false);
    await expect(client.request("/api/data")).resolves.toMatchObject({ ok: true });
  });

  it("other errors come back with the server's message and status", async () => {
    const server = createFakeAuthServer();
    const client = tab(server);
    await expect(client.loginDemo("superadmin")).rejects.toMatchObject({ status: 400, message: "Please fix the highlighted fields." });
  });
});
