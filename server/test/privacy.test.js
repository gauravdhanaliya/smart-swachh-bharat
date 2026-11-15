// Notifications, consent, and "delete my data".

import { DEFAULT_CONSENT_VERSION } from "../src/constants.js";
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { seedAll } from "../src/seed.js";
import { DEMO_BINS, DEMO_TOILETS } from "../src/seed-data.js";
import { COLLECTION_NAMES } from "../src/schemas.js";
import { apiClient, startTestServer } from "./helpers.js";

let t;
let api;
let official;
let worker;

before(async () => {
  t = await startTestServer({ DEMO_LOGIN_ENABLED: "true" }, { geoFetch: async () => Response.json([]) });
  await seedAll(t.repo, { demo: true });
  api = apiClient(t);
  official = await api.signIn("priv-official", { role: "official", name: "Officer" });
  worker = await api.signIn("priv-worker", { role: "worker", workerId: "w1", name: "Vikash Kumar" });
});
after(() => t.stop());

const GENERAL = { issueType: "Dirty Area", description: "Rubbish near the canteen", location: { address: "Canteen", latitude: 29.8905, longitude: 77.9616 } };
const ITEMS = { locationWhenReporting: true, photosAttached: true, readNotice: true };
const CURRENT = DEFAULT_CONSENT_VERSION; // the notice version a server uses by default

describe("notifications", () => {
  test("the server notifies the owner at each status change; nobody else sees them", async () => {
    const citizen = await api.signIn("notif-c1");
    const other = await api.signIn("notif-c2");
    const id = (await api.call("POST", "/api/complaints", { token: citizen.token, body: GENERAL })).json.complaint.id;
    await api.call("POST", `/api/complaints/${id}/assign`, { token: official.token, body: { workerId: "w1" } });
    await api.call("PATCH", `/api/complaints/${id}/status`, { token: worker.token, body: { status: "IN_PROGRESS" } });
    await api.call("PATCH", `/api/complaints/${id}/status`, { token: worker.token, body: { status: "RESOLVED", resolutionNote: "Area cleaned." } });

    const mine = await api.call("GET", "/api/notifications", { token: citizen.token });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.json.items.map((n) => n.message), [
      `Complaint ${id} has been resolved`,
      `Vikash Kumar is working on complaint ${id}`,
      `Complaint ${id} assigned to Vikash Kumar`,
    ]);
    assert.ok(mine.json.items.every((n) => n.kind === "complaint" && n.complaintId === id && n.readAt === null));
    assert.equal(mine.json.unread, 3);
    assert.equal((await api.call("GET", "/api/notifications", { token: other.token })).json.items.length, 0);

    // marking: own only, someone else's is a 404
    const nid = mine.json.items[0].id;
    assert.equal((await api.call("PATCH", `/api/notifications/${nid}/read`, { token: other.token })).status, 404);
    assert.equal((await api.call("PATCH", "/api/notifications/not-an-id/read", { token: citizen.token })).status, 404);
    const read = await api.call("PATCH", `/api/notifications/${nid}/read`, { token: citizen.token });
    assert.equal(read.status, 200);
    assert.ok(read.json.notification.readAt);
    const all = await api.call("POST", "/api/notifications/read-all", { token: citizen.token });
    assert.equal(all.json.updated, 2);
    assert.equal((await api.call("GET", "/api/notifications", { token: citizen.token })).json.unread, 0);
  });

  test("a worker is notified when their facility request is reviewed", async () => {
    const req = await api.call("POST", "/api/facility-requests", {
      token: worker.token,
      body: {
        facilityType: "Dustbin",
        suggestedName: "Bin by workshop",
        location: { address: "Workshop road", latitude: 29.8899, longitude: 77.96 },
        reason: "Waste piles up here daily",
        priority: "HIGH",
        requestedByWorkerId: "w1",
        requestedByWorkerName: "Vikash Kumar",
      },
    });
    assert.equal(req.status, 201, JSON.stringify(req.json));
    const id = req.json.request.id;
    await api.call("PATCH", `/api/facility-requests/${id}/status`, { token: official.token, body: { status: "REJECTED", rejectionReason: "Too close to an existing bin" } });
    const list = (await api.call("GET", "/api/notifications", { token: worker.token })).json.items;
    const n = list.find((x) => x.requestId === id);
    assert.ok(n, JSON.stringify(list));
    assert.equal(n.kind, "facility_request");
    assert.match(n.message, /rejected/i);
    assert.equal(n.detail, "Too close to an existing bin");
  });
});

describe("consent", () => {
  test("is versioned: none at first, saved with the current version, stale versions refused", async () => {
    const c = await api.signIn("consent-c1");
    let res = await api.call("GET", "/api/me/consent", { token: c.token });
    assert.deepEqual(res.json, { version: CURRENT, consent: null, upToDate: false });

    assert.equal((await api.call("PUT", "/api/me/consent", { token: c.token, body: { version: 0, items: ITEMS } })).status, 409);
    res = await api.call("PUT", "/api/me/consent", { token: c.token, body: { version: CURRENT, items: ITEMS } });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.upToDate, true);
    assert.equal(res.json.consent.version, CURRENT);
    assert.ok(res.json.consent.acceptedAt);
  });

  test("required boxes must be ticked; nothing unknown is accepted", async () => {
    const c = await api.signIn("consent-c2");
    for (const items of [
      { ...ITEMS, readNotice: false },
      { ...ITEMS, locationWhenReporting: false },
      { ...ITEMS, photosAttached: false },
      { ...ITEMS, phoneForLogin: true }, // the old phone item is gone
      { ...ITEMS, marketing: true },
      { ...ITEMS, readNotice: "yes" },
    ]) {
      assert.equal((await api.call("PUT", "/api/me/consent", { token: c.token, body: { version: CURRENT, items } })).status, 400, JSON.stringify(items));
    }
    assert.equal((await api.call("PUT", "/api/me/consent", { token: c.token, body: { version: CURRENT, items: ITEMS, acceptedAt: "2020-01-01" } })).status, 400);
  });

  test("a demo login accepts the same three boxes", async () => {
    const demo = await api.call("POST", "/api/auth/demo", { body: { role: "citizen" } });
    const res = await api.call("PUT", "/api/me/consent", { token: demo.json.accessToken, body: { version: CURRENT, items: ITEMS } });
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });

  test("a newer notice version makes an older consent out of date", async () => {
    const v2 = await startTestServer({ ECOSETU_CONSENT_VERSION: String(CURRENT + 1) });
    try {
      const a = apiClient(v2);
      const c = await a.signIn("consent-v2");
      await v2.db.collection("consents").insertOne({ _id: "consent-v2", version: CURRENT, acceptedAt: "2026-01-01T00:00:00.000Z", items: ITEMS, updatedAt: "2026-01-01T00:00:00.000Z" });
      const res = await a.call("GET", "/api/me/consent", { token: c.token });
      assert.deepEqual([res.json.version, res.json.upToDate, res.json.consent.version], [CURRENT + 1, false, CURRENT]);
      assert.equal((await a.call("PUT", "/api/me/consent", { token: c.token, body: { version: CURRENT, items: ITEMS } })).status, 409);
      assert.equal((await a.call("PUT", "/api/me/consent", { token: c.token, body: { version: CURRENT + 1, items: ITEMS } })).status, 200);
    } finally {
      await v2.stop();
    }
  });

  test("withdrawing consent removes it and signs the user out at once", async () => {
    const c = await api.signIn("consent-withdraw");
    await api.call("PUT", "/api/me/consent", { token: c.token, body: { version: CURRENT, items: ITEMS } });
    const res = await api.call("DELETE", "/api/me/consent", { token: c.token });
    assert.equal(res.status, 200);
    assert.equal(res.json.signedOut, true);
    assert.match(res.cookies.find((x) => x.startsWith("ssb_refresh=")), /Max-Age=0/);
    assert.equal(await t.db.collection("consents").countDocuments({ _id: "consent-withdraw" }), 0);
    assert.equal((await api.call("GET", "/api/auth/me", { token: c.token })).status, 401, "the access token stops working now, not in 15 minutes");
    assert.equal((await api.call("POST", "/api/auth/refresh", { cookie: c.cookie })).status, 401);

    // signing in again later works
    await new Promise((r) => setTimeout(r, 20));
    const again = await api.signIn("consent-withdraw");
    assert.equal((await api.call("GET", "/api/auth/me", { token: again.token })).status, 200);
  });
});

describe("delete my data", () => {
  test("removes everything linked to the user and keeps their complaints, anonymised", async () => {
    const uid = "erase-me-7f3a";
    const me = await api.signIn(uid, { name: "Erin" });
    const someone = await api.signIn("erase-bystander");

    // the user's footprint everywhere
    const c1 = (await api.call("POST", "/api/complaints", { token: me.token, body: { facilityType: "bin", facilityId: DEMO_BINS[2].id, category: "Damaged" } })).json.complaint.id;
    const c2 = (await api.call("POST", "/api/complaints", { token: me.token, body: GENERAL })).json.complaint.id;
    await api.call("POST", `/api/complaints/${c2}/vote`, { token: me.token, body: { direction: "up" } });
    await api.call("POST", `/api/complaints/${c2}/assign`, { token: official.token, body: { workerId: "w1" } }); // a notification
    await api.call("PUT", `/api/toilets/${DEMO_TOILETS[0].id}/rating`, { token: me.token, body: { stars: 5, comment: "Great" } });
    await api.call("PUT", "/api/me/consent", { token: me.token, body: { version: CURRENT, items: ITEMS } });
    assert.equal((await api.call("GET", "/api/geo/search?q=Roorkee", { token: me.token })).status, 200); // a per-user search counter
    await api.call("POST", "/api/complaints", { token: someone.token, body: GENERAL });
    const complaintsBefore = await t.db.collection("complaints").countDocuments();

    assert.equal((await api.call("DELETE", "/api/me/data", { token: me.token })).status, 400, "needs an explicit confirmation");
    assert.equal((await api.call("DELETE", "/api/me/data", { token: me.token, body: { confirm: "yes" } })).status, 400);
    const res = await api.call("DELETE", "/api/me/data", { token: me.token, body: { confirm: true } });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.deepEqual(Object.keys(res.json.deleted).sort(), ["account", "consent", "notifications", "photos", "ratings", "votes"]);
    assert.equal(res.json.anonymised.complaints, 2);

    // nothing anywhere still points at the user
    for (const name of [...COLLECTION_NAMES, "complaint_votes"]) {
      const docs = await t.db.collection(name).find({}).toArray();
      assert.ok(!JSON.stringify(docs).includes(uid), `${name} still mentions the user`);
      assert.ok(!JSON.stringify(docs).includes("Erin"), `${name} still has the user's name`);
    }
    // complaints stay for the municipal record, without the link
    assert.equal(await t.db.collection("complaints").countDocuments(), complaintsBefore);
    for (const id of [c1, c2]) {
      const doc = await t.db.collection("complaints").findOne({ _id: id });
      assert.equal(doc.citizenId, null);
      assert.equal(doc.citizenName, "Deleted user");
    }
    // the rating is gone from the averages too
    assert.equal((await api.call("GET", `/api/toilets/${DEMO_TOILETS[0].id}/ratings/summary`)).json.count, 0);
    // and the session is over
    assert.equal((await api.call("GET", "/api/auth/me", { token: me.token })).status, 401);
    assert.equal((await api.call("POST", "/api/auth/refresh", { cookie: me.cookie })).status, 401);
    // a new report on the same bin is not blocked by the anonymised one
    const back = await api.signIn(uid);
    assert.equal((await api.call("POST", "/api/complaints", { token: back.token, body: { facilityType: "bin", facilityId: DEMO_BINS[2].id, category: "Damaged" } })).status, 201);
  });

  test("an official's name and id are removed from the records they touched", async () => {
    const uid = "erase-official-9c";
    const off = await api.signIn(uid, { role: "official", name: "Officer Zed" });
    const loc = (await api.call("POST", "/api/locations", { token: off.token, body: { name: "Zed bin", type: "dustbin", latitude: 29.89, longitude: 77.96, address: "x" } })).json.location;
    await api.call("DELETE", `/api/locations/${loc.id}`, { token: off.token, body: { reason: "Test" } });
    assert.equal((await api.call("DELETE", "/api/me/data", { token: off.token, body: { confirm: true } })).status, 200);
    const doc = await t.db.collection("locations").findOne({ _id: loc.id });
    assert.equal(doc.createdBy, "Deleted user");
    assert.equal(doc.deletedBy, "Deleted user");
  });

  test("the shared demo accounts can't be deleted", async () => {
    const demo = await api.call("POST", "/api/auth/demo", { body: { role: "citizen" } });
    assert.equal((await api.call("DELETE", "/api/me/data", { token: demo.json.accessToken, body: { confirm: true } })).status, 403);
    assert.ok(await t.db.collection("users").findOne({ uid: "demo-citizen" }));
  });
});

describe("unknown fields are refused on the older routes too", () => {
  test("locations, facility requests and login", async () => {
    const loc = await api.call("POST", "/api/locations", { token: official.token, body: { name: "X", type: "dustbin", latitude: 29.89, longitude: 77.96, address: "x", createdBy: "someone" } });
    assert.equal(loc.status, 400);
    assert.ok(loc.json.fields.createdBy);
    const req = await api.call("PATCH", "/api/facility-requests/FR-2026-001/status", { token: official.token, body: { status: "UNDER_REVIEW", reviewedBy: "me" } });
    assert.equal(req.status, 400);
    const login = await api.call("POST", "/api/auth/firebase", { body: { idToken: "x", role: "official" } });
    assert.equal(login.status, 400);
  });

  test("older lists are paged too", async () => {
    const res = await api.call("GET", "/api/locations");
    assert.equal(res.status, 200);
    assert.deepEqual([res.json.page, res.json.limit], [1, 20]);
    assert.ok(res.json.locations.length <= 20);
    assert.ok(res.json.total > 20, "the demo data alone is more than one page");
    assert.equal(res.json.hasMore, true);
    assert.equal((await api.call("GET", "/api/locations?limit=500")).status, 400);
  });
});
