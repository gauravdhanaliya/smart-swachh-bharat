// The shared map data store across sign-ins: a fetch still in flight for the
// previous user must never land in the next user's store, and a new user's
// data is fetched right after sign-in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every /locations-style call waits until the test answers it.
const pending = [];
vi.mock("./api", () => ({
  api: vi.fn(
    (path) =>
      new Promise((resolve, reject) => {
        pending.push({ path, resolve, reject });
      })
  ),
  apiAll: vi.fn(),
}));

import { api } from "./api";
import { getRequestsSnapshot, getSyncStatus, refresh, refreshAfterSignIn, resetStore, getLocations } from "./locationStore";
import { startSession } from "./authSession";

const bin = (id) => ({ id, name: id, type: "dustbin", latitude: 29.89, longitude: 77.96, status: "normal", details: {} });
const officialData = { locations: [bin("DB-OFFICIAL")], requests: [{ id: "FR-2026-900", status: "PENDING" }] };

/** Answers every call made so far: /locations, /locations/removed, /facility-requests. */
function answer({ locations, requests = [] }) {
  for (const call of pending.splice(0)) {
    if (call.path === "/locations") call.resolve({ locations });
    else if (call.path === "/locations/removed") call.resolve({ locations: [] });
    else if (call.path === "/facility-requests") call.resolve({ requests });
    else call.reject(new Error(`unexpected ${call.path}`));
  }
}
const settle = () => new Promise((r) => setTimeout(r, 0));
// refresh() starts its calls one microtask later.
const tick = () => Promise.resolve();

beforeEach(() => {
  pending.length = 0;
  api.mockClear();
  resetStore();
});
afterEach(() => resetStore());

describe("signing in", () => {
  it("a fetch still in flight for the previous user is ignored when it answers", async () => {
    startSession("official", "");
    const stale = refresh();
    await tick();
    expect(pending.map((c) => c.path)).toContain("/facility-requests");

    // The official signs out and a citizen signs in while that fetch is out.
    startSession("citizen", "");
    refreshAfterSignIn();
    await tick();
    const citizenCalls = pending.splice(pending.length - 1); // the citizen's /locations only
    expect(citizenCalls.map((c) => c.path)).toEqual(["/locations"]);

    // The official's answer arrives late: nothing of it may show.
    answer(officialData);
    await stale;
    expect(getRequestsSnapshot()).toEqual([]);
    expect(getLocations()).toEqual([]);
    expect(getSyncStatus().loaded).toBe(false);

    // The citizen's own answer is what lands.
    citizenCalls[0].resolve({ locations: [bin("DB-CITIZEN")] });
    await settle();
    expect(getLocations().map((l) => l.id)).toEqual(["DB-CITIZEN"]);
    expect(getRequestsSnapshot()).toEqual([]);
    expect(getSyncStatus().loaded).toBe(true);
  });

  it("refreshAfterSignIn fetches at once, without waiting for a screen or the poll", async () => {
    startSession("official", "");
    refreshAfterSignIn();
    await tick();
    expect(pending.map((c) => c.path).sort()).toEqual(["/facility-requests", "/locations", "/locations/removed"]);
    answer(officialData);
    await settle();
    expect(getRequestsSnapshot().map((r) => r.id)).toEqual(["FR-2026-900"]);
  });

  it("a failed fetch for the previous user doesn't mark the new user's store as failed", async () => {
    startSession("official", "");
    const stale = refresh();
    await tick();
    startSession("citizen", "");
    refreshAfterSignIn();
    await tick();
    for (const call of pending.splice(0, pending.length - 1)) call.reject(new Error("offline"));
    await stale;
    expect(getSyncStatus().error).toBeNull();
  });

  it("after a reset, a new refresh isn't handed the previous user's promise", () => {
    startSession("official", "");
    const first = refresh();
    resetStore();
    const second = refresh();
    expect(second).not.toBe(first);
  });
});
