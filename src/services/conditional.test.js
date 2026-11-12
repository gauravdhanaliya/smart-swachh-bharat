// Unchanged lists cost almost nothing: the session client remembers each
// list's ETag, sends it back, and reuses its copy on a 304. The complaint
// store doesn't even re-render when the answer is "unchanged".

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionClient } from "./session";

// A server with one list whose ETag changes only when the data does.
function listServer() {
  let data = { items: [{ id: "SSB2026-0001", status: "SUBMITTED" }], page: 1, limit: 100, total: 1, hasMore: false };
  const etag = () => `W/"v-${JSON.stringify(data).length}-${data.items.map((i) => i.status).join()}"`;
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const sent = init.headers?.["If-None-Match"] ?? null;
    calls.push({ url: String(url), ifNoneMatch: sent });
    if (String(url).endsWith("/api/auth/demo")) {
      return { ok: true, status: 200, json: async () => ({ accessToken: "at-1", user: { uid: "u", role: "citizen" } }), headers: new Headers() };
    }
    if (sent === etag()) return { ok: false, status: 304, json: async () => null, headers: new Headers({ ETag: etag() }) };
    const body = structuredClone(data);
    return { ok: true, status: 200, json: async () => body, headers: new Headers({ ETag: etag() }) };
  };
  return {
    fetch: fetchImpl,
    calls,
    change() {
      data = { ...data, items: [{ id: "SSB2026-0001", status: "ASSIGNED" }] };
    },
  };
}

const clients = [];
afterEach(() => {
  while (clients.length) clients.pop().dispose();
});

describe("conditional requests", () => {
  it("send the remembered ETag and reuse the copy on 304", async () => {
    const server = listServer();
    const client = createSessionClient({ fetch: server.fetch, locks: null, createChannel: () => null });
    clients.push(client);
    await client.loginDemo("citizen");

    const first = await client.request("/api/complaints", { conditional: true });
    expect(server.calls.at(-1).ifNoneMatch).toBeNull();
    const second = await client.request("/api/complaints", { conditional: true });
    expect(server.calls.at(-1).ifNoneMatch).toMatch(/^W\//);
    expect(second).toBe(first, "the same object: nothing new was downloaded");

    server.change();
    const third = await client.request("/api/complaints", { conditional: true });
    expect(third.items[0].status).toBe("ASSIGNED");
  });

  it("are only used where asked for", async () => {
    const server = listServer();
    const client = createSessionClient({ fetch: server.fetch, locks: null, createChannel: () => null });
    clients.push(client);
    await client.loginDemo("citizen");
    await client.request("/api/complaints");
    await client.request("/api/complaints");
    expect(server.calls.filter((c) => c.url.endsWith("/api/complaints")).every((c) => c.ifNoneMatch === null)).toBe(true);
  });

  it("forget every remembered copy when the user changes", async () => {
    const server = listServer();
    const client = createSessionClient({ fetch: server.fetch, locks: null, createChannel: () => null });
    clients.push(client);
    await client.loginDemo("citizen");
    await client.request("/api/complaints", { conditional: true });
    await client.logout();
    await client.loginDemo("citizen");
    await client.request("/api/complaints", { conditional: true });
    // a new user never gets the last user's cached list
    expect(server.calls.at(-1).ifNoneMatch).toBeNull();
  });
});

describe("the complaint store", () => {
  it("does not notify (re-render) when a poll finds nothing new", async () => {
    vi.resetModules();
    const lists = [[{ id: "a", status: "SUBMITTED" }], null, [{ id: "a", status: "ASSIGNED" }]];
    let call = 0;
    let last = null;
    vi.doMock("./api", () => ({
      api: vi.fn(),
      // a 304 hands back the very same array as last time
      apiAll: vi.fn(async () => {
        const next = lists[call++];
        last = next ?? last;
        return last;
      }),
    }));
    const remote = await import("./complaintRemote");
    const listener = vi.fn();
    remote.subscribeQuiet(listener);
    await remote.refresh();
    expect(listener).toHaveBeenCalledTimes(1);
    await remote.refresh(); // unchanged
    expect(listener).toHaveBeenCalledTimes(1);
    await remote.refresh(); // changed
    expect(listener).toHaveBeenCalledTimes(2);
    vi.doUnmock("./api");
  });
});
