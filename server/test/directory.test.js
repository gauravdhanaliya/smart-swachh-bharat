// Conditional list requests (ETag / 304), the profile, the worker directory,
// and the server's citizen notifications.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { seedAll } from "../src/seed.js";
import { apiClient, startTestServer } from "./helpers.js";

let t;
let api;
let citizen;
let official;
let worker;

before(async () => {
  t = await startTestServer();
  await seedAll(t.repo, { demo: true });
  api = apiClient(t);
  citizen = await api.signIn("dir-citizen", { name: "Asha" });
  official = await api.signIn("dir-official", { role: "official", name: "Officer Dir" });
  worker = await api.signIn("dir-worker", { role: "worker", workerId: "w1", name: "Vikash Kumar" });
});
after(() => t.stop());

const GENERAL = { issueType: "Dirty Area", description: "Rubbish near the gate", location: { address: "Gate", latitude: 29.8886, longitude: 77.959 } };

async function get(path, token, headers = {}) {
  const res = await fetch(t.base + path, { headers: { Authorization: `Bearer ${token}`, ...headers } });
  const text = await res.text();
  return { status: res.status, etag: res.headers.get("etag"), text, json: text ? JSON.parse(text) : null };
}

describe("unchanged lists answer 304 with no body", () => {
  test("complaints: same ETag -> 304; after a change -> 200 with a new ETag", async () => {
    await api.call("POST", "/api/complaints", { token: citizen.token, body: GENERAL });
    const first = await get("/api/complaints?page=1&limit=100", citizen.token);
    assert.equal(first.status, 200);
    assert.ok(first.etag, "an ETag is sent");

    const again = await get("/api/complaints?page=1&limit=100", citizen.token, { "If-None-Match": first.etag });
    assert.equal(again.status, 304);
    assert.equal(again.text, "", "nothing but headers");

    await api.call("POST", "/api/complaints", { token: citizen.token, body: { ...GENERAL, description: "A second report" } });
    const changed = await get("/api/complaints?page=1&limit=100", citizen.token, { "If-None-Match": first.etag });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.etag, first.etag);
  });

  test("a vote changes the list's ETag too", async () => {
    const before = await get("/api/complaints?page=1&limit=100", citizen.token);
    const id = before.json.items[0].id;
    await api.call("POST", `/api/complaints/${id}/vote`, { token: citizen.token, body: { direction: "up" } });
    assert.equal((await get("/api/complaints?page=1&limit=100", citizen.token, { "If-None-Match": before.etag })).status, 200);
  });

  test("one user's ETag never unlocks another user's list", async () => {
    const mine = await get("/api/complaints?page=1&limit=100", citizen.token);
    const theirs = await get("/api/complaints?page=1&limit=100", official.token, { "If-None-Match": mine.etag });
    assert.equal(theirs.status, 200);
    assert.notEqual(theirs.etag, mine.etag);
  });

  test("notifications support it as well", async () => {
    const first = await get("/api/notifications", citizen.token);
    assert.equal((await get("/api/notifications", citizen.token, { "If-None-Match": first.etag })).status, 304);
  });
});

describe("profile", () => {
  test("officials have a government profile they can edit; it starts from the defaults", async () => {
    const res = await api.call("GET", "/api/profile", { token: official.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.profile, { name: "Officer Dir", state: "Uttarakhand", district: "Haridwar", ministry: "Ministry of Housing & Urban Affairs" });

    const saved = await api.call("PATCH", "/api/profile", { token: official.token, body: { district: "  Roorkee  ", name: "Officer Dir K" } });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.deepEqual(saved.json.profile, { name: "Officer Dir K", state: "Uttarakhand", district: "Roorkee", ministry: "Ministry of Housing & Urban Affairs" });
    assert.equal((await api.call("GET", "/api/auth/me", { token: official.token })).json.user.name, "Officer Dir K", "the account's display name follows");
  });

  test("other roles have only a name", async () => {
    const res = await api.call("GET", "/api/profile", { token: citizen.token });
    assert.deepEqual(res.json.profile, { name: "Asha" });
    assert.equal((await api.call("PATCH", "/api/profile", { token: citizen.token, body: { district: "Delhi" } })).status, 400);
    assert.equal((await api.call("PATCH", "/api/profile", { token: citizen.token, body: { name: "Asha R" } })).json.profile.name, "Asha R");
  });

  test("validated: unknown fields, types, lengths, empty name", async () => {
    for (const body of [{ role: "official" }, { name: "" }, { name: "x".repeat(81) }, { district: { $ne: "" } }, { ministry: "m".repeat(121) }, []]) {
      assert.equal((await api.call("PATCH", "/api/profile", { token: official.token, body })).status, 400, JSON.stringify(body));
    }
    assert.equal((await api.call("GET", "/api/profile")).status, 401);
  });

  test("each user sees only their own", async () => {
    const other = await api.signIn("dir-official-2", { role: "official", name: "Other Officer" });
    assert.equal((await api.call("GET", "/api/profile", { token: other.token })).json.profile.district, "Haridwar");
  });
});

describe("worker directory (officials only)", () => {
  test("lists the seeded demo workers, paged", async () => {
    const res = await api.call("GET", "/api/workers", { token: official.token });
    assert.equal(res.status, 200);
    assert.deepEqual([res.json.page, res.json.limit], [1, 20]);
    const ids = res.json.items.map((w) => w.id);
    assert.ok(ids.includes("w1") && ids.includes("w2"));
    assert.ok(res.json.items.every((w) => !("createdById" in w) && !("phone" in w)), "no user ids or phone numbers");
  });

  test("only officials can read or change it", async () => {
    for (const who of [citizen, worker]) {
      assert.equal((await api.call("GET", "/api/workers", { token: who.token })).status, 403);
      assert.equal((await api.call("POST", "/api/workers", { token: who.token, body: { name: "X", area: "Y" } })).status, 403);
    }
    assert.equal((await api.call("GET", "/api/workers")).status, 401);
  });

  test("add: name + email (the email kept only masked and hashed), ids generated; no phone any more", async () => {
    for (const body of [{}, { name: "A" }, { name: "A", email: "a@example.test", status: "Asleep" }, { name: "A", email: "a@example.test", phone: "+91 98765 43210" }, { name: "A", email: "a@example.test", id: "w1" }, { name: "x".repeat(81), email: "a@example.test" }]) {
      assert.equal((await api.call("POST", "/api/workers", { token: official.token, body })).status, 400, JSON.stringify(body));
    }
    const res = await api.call("POST", "/api/workers", { token: official.token, body: { name: "  Meena  ", email: "meena@example.test", area: "Ganeshpur", status: "On Duty" } });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const w = res.json.worker;
    assert.match(w.id, /^gw-\d+$/);
    assert.match(w.displayId, /^W\d{3}$/);
    assert.deepEqual([w.name, w.area, w.status, w.role, w.emailMasked, w.phoneMasked, w.source], ["Meena", "Ganeshpur", "On Duty", "Sanitation Worker", "me***@e***.test", null, "GOVERNMENT"]);
    const doc = await t.db.collection("workers").findOne({ _id: w.id });
    assert.ok(!JSON.stringify(doc).includes("meena@example.test"), "the address is never stored");
    assert.match(doc.emailHash, /^[0-9a-f]{64}$/);
  });

  test("remove and restore; removed workers can't be assigned", async () => {
    const removed = await api.call("DELETE", "/api/workers/w2", { token: official.token, body: { reason: "Transferred" } });
    assert.equal(removed.status, 200);
    assert.equal(removed.json.worker.removalReason, "Transferred");
    assert.equal((await api.call("DELETE", "/api/workers/w2", { token: official.token, body: {} })).status, 404, "already removed");
    assert.ok(!(await api.listAll("/api/workers", "items", official.token)).some((w) => w.id === "w2"));
    assert.ok((await api.listAll("/api/workers?removed=true", "items", official.token)).some((w) => w.id === "w2"));

    // an account linked to a removed directory entry is not an active worker
    await api.signIn("dir-worker-2", { role: "worker", workerId: "w2" });
    const c = (await api.call("POST", "/api/complaints", { token: citizen.token, body: { ...GENERAL, description: "Assign me" } })).json.complaint.id;
    assert.equal((await api.call("POST", `/api/complaints/${c}/assign`, { token: official.token, body: { workerId: "w2" } })).status, 400);

    assert.equal((await api.call("POST", "/api/workers/w2/restore", { token: official.token })).status, 200);
    assert.equal((await api.call("POST", "/api/workers/w2/restore", { token: official.token })).status, 404, "not removed any more");
    assert.equal((await api.call("POST", `/api/complaints/${c}/assign`, { token: official.token, body: { workerId: "w2" } })).status, 200);
    assert.equal((await api.call("DELETE", "/api/workers/nobody", { token: official.token, body: {} })).status, 404);
    assert.equal((await api.call("DELETE", "/api/workers/w1", { token: official.token, body: { reason: "x", extra: 1 } })).status, 400);
  });
});

describe("citizen notifications from the server", () => {
  test("carry the complaint status, so the app can filter them by the user's alert settings", async () => {
    const c = (await api.call("POST", "/api/complaints", { token: citizen.token, body: { ...GENERAL, description: "Notify me" } })).json.complaint.id;
    await api.call("POST", `/api/complaints/${c}/assign`, { token: official.token, body: { workerId: "w1" } });
    const list = (await api.call("GET", "/api/notifications", { token: citizen.token })).json.items;
    const n = list.find((x) => x.complaintId === c);
    assert.equal(n.status, "ASSIGNED");
  });
});
