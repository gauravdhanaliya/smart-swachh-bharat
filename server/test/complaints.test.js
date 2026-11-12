// Complaints: every rule is enforced by the server, whatever the UI does.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { seedAll } from "../src/seed.js";
import { DEMO_BINS, DEMO_TOILETS } from "../src/seed-data.js";
import { apiClient, startTestServer } from "./helpers.js";

let t;
let api;
const BIN = DEMO_BINS[0];
const TOILET = DEMO_TOILETS[0];
const LOCATION = { address: "Near the main gate, COER University", latitude: 29.8886, longitude: 77.959 };
const GENERAL = { issueType: "Dirty Area", description: "Garbage piled up beside the road", location: LOCATION };

let citizenA;
let citizenB;
let workerW1; // the seeded demo worker, linked to demo worker w1
let workerW2;
let official;

before(async () => {
  t = await startTestServer({ ECOSETU_COMPLAINT_RATE_MAX: "1000" });
  await seedAll(t.repo, { demo: true });
  api = apiClient(t);
  citizenA = await api.signIn("cmp-citizen-a", { name: "Asha" });
  citizenB = await api.signIn("cmp-citizen-b", { name: "Bharat" });
  workerW1 = await api.signIn("cmp-worker-1", { role: "worker", workerId: "w1", name: "Vikash Kumar" });
  workerW2 = await api.signIn("cmp-worker-2", { role: "worker", workerId: "w2", name: "Ramesh Kumar" });
  official = await api.signIn("cmp-official", { role: "official", name: "Officer" });
});
after(() => t.stop());

const create = (who, body) => api.call("POST", "/api/complaints", { token: who.token, body });
const status = (who, id, body) => api.call("PATCH", `/api/complaints/${id}/status`, { token: who.token, body });
const assign = (who, id, workerId) => api.call("POST", `/api/complaints/${id}/assign`, { token: who.token, body: { workerId } });

async function resolve(id, worker = workerW1, workerId = "w1") {
  assert.equal((await assign(official, id, workerId)).status, 200);
  assert.equal((await status(worker, id, { status: "IN_PROGRESS" })).status, 200);
  assert.equal((await status(worker, id, { status: "RESOLVED", resolutionNote: "Cleaned and checked." })).status, 200);
}

describe("creating", () => {
  test("a citizen reports a general issue; the server sets id, status and priority", async () => {
    const res = await create(citizenA, { ...GENERAL, description: "   Garbage piled up beside the road   " });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const c = res.json.complaint;
    assert.match(c.id, /^SSB2026-\d{4,}$/);
    assert.equal(c.status, "SUBMITTED");
    assert.equal(c.priority, "MEDIUM");
    assert.equal(c.description, "Garbage piled up beside the road", "trimmed");
    assert.equal(c.citizenName, "Asha");
    assert.equal(c.facilityType, null);
    assert.equal(c.citizenId, undefined, "user ids are not sent to clients");
  });

  test("bodies are validated: unknown fields, types, lengths, issue types", async () => {
    const bad = [
      [{ ...GENERAL, priority: "HIGH" }, "priority"],
      [{ ...GENERAL, status: "RESOLVED" }, "status"],
      [{ ...GENERAL, citizenId: "someone" }, "citizenId"],
      [{ ...GENERAL, issueType: "Alien landing" }, "issueType"],
      [{ ...GENERAL, issueType: { $gt: "" } }, "issueType"],
      [{ ...GENERAL, description: "x".repeat(501) }, "description"],
      [{ ...GENERAL, location: undefined }, "location"],
      [{ ...GENERAL, location: { ...LOCATION, latitude: 95 } }, "latitude"],
      [{ ...GENERAL, photo: "data:text/html;base64,PHA+" }, "photo"],
    ];
    for (const [body, field] of bad) {
      const res = await create(citizenA, body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      assert.ok(res.json.fields?.[field], `expected an error on ${field}: ${JSON.stringify(res.json)}`);
    }
  });

  test("only citizens report complaints", async () => {
    for (const who of [workerW1, official]) assert.equal((await create(who, GENERAL)).status, 403);
    assert.equal((await api.call("POST", "/api/complaints", { body: GENERAL })).status, 401);
  });
});

describe("facility-linked complaints", () => {
  test("a bin report takes its location from the bin, and its category is checked against the bin list", async () => {
    const res = await create(citizenA, { facilityType: "bin", facilityId: BIN.id, category: "Damaged", description: "Lid broken" });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const c = res.json.complaint;
    assert.deepEqual([c.facilityType, c.facilityId, c.category], ["bin", BIN.id, "Damaged"]);
    assert.equal(c.issueType, "Bin Issue");
    assert.deepEqual(c.location, { address: BIN.address, latitude: BIN.latitude, longitude: BIN.longitude });
  });

  test("a sent location is not allowed to override the facility's", async () => {
    const res = await create(citizenA, { facilityType: "bin", facilityId: BIN.id, category: "Bad smell", location: LOCATION });
    assert.equal(res.status, 400);
    assert.ok(res.json.fields.location);
  });

  test("a toilet report uses the toilet categories", async () => {
    const res = await create(citizenA, { facilityType: "toilet", facilityId: TOILET.id, category: "No water" });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(res.json.complaint.issueType, "Public Toilet Issue");
    assert.equal(res.json.complaint.priority, "HIGH");
  });

  test("the facility must exist, be of that type, and not be removed", async () => {
    const official2 = official.token;
    const removable = (await api.call("POST", "/api/locations", {
      token: official2,
      body: { name: "Soon gone", type: "dustbin", latitude: 29.89, longitude: 77.96, address: "x" },
    })).json.location;
    await api.call("DELETE", `/api/locations/${removable.id}`, { token: official2, body: { reason: "Duplicate" } });

    for (const body of [
      { facilityType: "bin", facilityId: "DB-999", category: "Damaged" },
      { facilityType: "bin", facilityId: TOILET.id, category: "Damaged" },
      { facilityType: "toilet", facilityId: BIN.id, category: "Dirty" },
      { facilityType: "bin", facilityId: removable.id, category: "Damaged" },
    ]) {
      const res = await create(citizenA, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.json.fields.facilityId, JSON.stringify(res.json));
    }
  });

  test("categories are checked per facility type; Other needs a description", async () => {
    const cases = [
      [{ facilityType: "bin", facilityId: BIN.id, category: "No water" }, "category"],
      [{ facilityType: "toilet", facilityId: TOILET.id, category: "Overflowing" }, "category"],
      [{ facilityType: "bin", facilityId: BIN.id }, "category"],
      [{ facilityType: "bin", facilityId: BIN.id, category: "Other" }, "description"],
      [{ facilityType: "bin", facilityId: BIN.id, category: "Other", description: "   " }, "description"],
      [{ facilityType: "park", facilityId: BIN.id, category: "Other", description: "x" }, "facilityType"],
      [{ facilityId: BIN.id, category: "Damaged" }, "facilityType"],
      [{ facilityType: "bin", category: "Damaged" }, "facilityId"],
    ];
    for (const [body, field] of cases) {
      const res = await create(citizenB, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.json.fields[field], `${field}: ${JSON.stringify(res.json)}`);
    }
    const other = await create(citizenB, { facilityType: "bin", facilityId: BIN.id, category: "Other", description: "Bin moved onto the road" });
    assert.equal(other.status, 201);
  });

  test("open complaint counts per facility are public", async () => {
    const res = await api.call("GET", `/api/locations/${TOILET.id}/complaints/summary`);
    assert.equal(res.status, 200);
    assert.ok(res.json.openCount >= 1);
    assert.deepEqual(Object.keys(res.json).sort(), ["facilityId", "openCount"]);
  });
});

describe("duplicate open reports", () => {
  const body = { facilityType: "bin", facilityId: DEMO_BINS[1].id, category: "Overflowing" };

  test("the same user, facility and category while still open is a 409 naming the existing complaint", async () => {
    const first = await create(citizenA, body);
    assert.equal(first.status, 201);
    const again = await create(citizenA, body);
    assert.equal(again.status, 409);
    assert.equal(again.json.existingId, first.json.complaint.id);

    assert.equal((await create(citizenA, { ...body, category: "Bad smell" })).status, 201, "another category is fine");
    assert.equal((await create(citizenB, body)).status, 201, "another citizen is fine");

    await resolve(first.json.complaint.id);
    assert.equal((await create(citizenA, body)).status, 201, "allowed again once the first is resolved");
  });

  test("two identical reports sent at the same moment create exactly one complaint", async () => {
    const same = { facilityType: "toilet", facilityId: DEMO_TOILETS[1].id, category: "Dirty" };
    const results = await Promise.all([create(citizenB, same), create(citizenB, same), create(citizenB, same)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
    const created = results.find((r) => r.status === 201).json.complaint.id;
    assert.ok(results.filter((r) => r.status === 409).every((r) => r.json.existingId === created));
  });
});

describe("status changes", () => {
  let id;
  test("setup: a fresh complaint", async () => {
    id = (await create(citizenA, { ...GENERAL, description: "Overflowing drain near hostel" })).json.complaint.id;
  });

  test("only officials assign, and only to an active worker", async () => {
    assert.equal((await assign(workerW1, id, "w1")).status, 403);
    assert.equal((await assign(citizenA, id, "w1")).status, 403);
    for (const workerId of ["w9", "", "../x"]) {
      const res = await assign(official, id, workerId);
      assert.equal(res.status, 400, workerId);
    }
    // a user who was a worker but has been made a citizen again is not active
    const former = await api.signIn("cmp-former-worker", { role: "worker", workerId: "w7" });
    await t.repo.grantRole({ uid: "cmp-former-worker", role: "citizen", workerId: null });
    assert.ok(former);
    assert.equal((await assign(official, id, "w7")).status, 400);

    const res = await assign(official, id, "w1");
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.complaint.status, "ASSIGNED");
    assert.equal(res.json.complaint.assignedWorkerId, "w1");
    assert.equal(res.json.complaint.assignedWorkerName, "Vikash Kumar");
  });

  test("an official may re-assign before work starts", async () => {
    assert.equal((await assign(official, id, "w2")).status, 200);
    assert.equal((await assign(official, id, "w1")).status, 200);
  });

  test("workers only see and update complaints assigned to them", async () => {
    assert.equal((await status(workerW2, id, { status: "IN_PROGRESS" })).status, 404);
    assert.equal((await api.call("GET", `/api/complaints/${id}`, { token: workerW2.token })).status, 404);
    assert.equal((await api.call("GET", `/api/complaints/${id}`, { token: workerW1.token })).status, 200);
  });

  test("invalid transitions are 409; unknown statuses 400; citizens and officials can't move work along", async () => {
    assert.equal((await status(workerW1, id, { status: "RESOLVED", resolutionNote: "Done already" })).status, 409, "ASSIGNED -> RESOLVED skips a step");
    assert.equal((await status(workerW1, id, { status: "SUBMITTED" })).status, 409);
    assert.equal((await status(workerW1, id, { status: "ASSIGNED" })).status, 409);
    assert.equal((await status(workerW1, id, { status: "BANANA" })).status, 400);
    assert.equal((await status(citizenA, id, { status: "IN_PROGRESS" })).status, 403);
    assert.equal((await status(official, id, { status: "IN_PROGRESS" })).status, 403);
  });

  test("the assigned worker starts and resolves it; resolving needs a note", async () => {
    assert.equal((await status(workerW1, id, { status: "IN_PROGRESS" })).status, 200);
    assert.equal((await status(workerW1, id, { status: "IN_PROGRESS" })).status, 409);
    assert.equal((await assign(official, id, "w2")).status, 409, "no re-assigning once work has started");
    assert.equal((await status(workerW1, id, { status: "RESOLVED" })).status, 400);
    assert.equal((await status(workerW1, id, { status: "RESOLVED", resolutionNote: "ok" })).status, 400, "too short");
    assert.equal((await status(workerW1, id, { status: "RESOLVED", resolutionNote: "x".repeat(301) })).status, 400);
    const done = await status(workerW1, id, { status: "RESOLVED", resolutionNote: "  Drain cleared and area washed.  " });
    assert.equal(done.status, 200);
    assert.equal(done.json.complaint.resolutionNote, "Drain cleared and area washed.");
    assert.equal((await status(workerW1, id, { status: "IN_PROGRESS" })).status, 409, "resolved is final");
    assert.equal((await assign(official, id, "w1")).status, 409);
  });

  test("two workers' tabs starting the same job at once: one wins, the other gets 409", async () => {
    const c = (await create(citizenB, { ...GENERAL, description: "Broken bench and litter" })).json.complaint.id;
    await assign(official, c, "w1");
    const results = await Promise.all([status(workerW1, c, { status: "IN_PROGRESS" }), status(workerW1, c, { status: "IN_PROGRESS" })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  });

  test("officials can change the priority; nobody else can", async () => {
    const c = (await create(citizenB, { ...GENERAL, description: "Leaves blocking the drain" })).json.complaint.id;
    assert.equal((await api.call("PATCH", `/api/complaints/${c}/priority`, { token: workerW1.token, body: { priority: "HIGH" } })).status, 403);
    assert.equal((await api.call("PATCH", `/api/complaints/${c}/priority`, { token: official.token, body: { priority: "URGENT" } })).status, 400);
    const ok = await api.call("PATCH", `/api/complaints/${c}/priority`, { token: official.token, body: { priority: "HIGH" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.complaint.priority, "HIGH");
  });
});

describe("who sees what", () => {
  test("a citizen sees only their own complaints; someone else's is a 404 like a missing one", async () => {
    const mine = await api.listAll("/api/complaints", "items", citizenA.token);
    const theirs = await api.listAll("/api/complaints", "items", citizenB.token);
    assert.ok(mine.length > 0 && theirs.length > 0);
    assert.ok(mine.every((c) => !theirs.some((o) => o.id === c.id)));

    const other = await api.call("GET", `/api/complaints/${theirs[0].id}`, { token: citizenA.token });
    const missing = await api.call("GET", "/api/complaints/SSB2026-9999", { token: citizenA.token });
    assert.equal(other.status, 404);
    assert.deepEqual(other.json, missing.json);
  });

  test("officials see everything and can filter by facility type and facility", async () => {
    const all = await api.listAll("/api/complaints", "items", official.token);
    const bins = await api.listAll("/api/complaints?facilityType=bin", "items", official.token);
    const toilet = await api.listAll(`/api/complaints?facilityId=${TOILET.id}`, "items", official.token);
    assert.ok(all.length >= bins.length + toilet.length);
    assert.ok(bins.length > 0 && bins.every((c) => c.facilityType === "bin"));
    assert.ok(toilet.length > 0 && toilet.every((c) => c.facilityId === TOILET.id));
    assert.equal((await api.call("GET", "/api/complaints?facilityType=park", { token: official.token })).status, 400);
  });

  test("workers see only what is assigned to them", async () => {
    const list = await api.listAll("/api/complaints", "items", workerW2.token);
    assert.ok(list.every((c) => c.assignedWorkerId === "w2"));
  });

  test("photos are never inside a complaint, listed or not: they come from photoUrl", async () => {
    const photo = `data:image/jpeg;base64,${Buffer.alloc(2000, 1).toString("base64")}`;
    const c = (await create(citizenA, { ...GENERAL, description: "Photo attached here", photo })).json.complaint;
    const listed = (await api.listAll("/api/complaints", "items", citizenA.token)).find((x) => x.id === c.id);
    assert.equal(listed.photo, undefined);
    assert.equal(listed.hasPhoto, true);
    const detail = await api.call("GET", `/api/complaints/${c.id}`, { token: citizenA.token });
    assert.equal(detail.json.complaint.photo, undefined);
    assert.equal(detail.json.complaint.photoUrl, `/api/complaints/${c.id}/photo`);
    const image = await fetch(t.base + detail.json.complaint.photoUrl, { headers: { Authorization: `Bearer ${citizenA.token}` } });
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.alloc(2000, 1));
  });
});

describe("pagination", () => {
  test("default 20, at most 100, stable order with no item on two pages", async () => {
    const someone = await api.signIn("cmp-pager");
    for (let i = 0; i < 25; i++) assert.equal((await create(someone, { ...GENERAL, description: `Item number ${i}` })).status, 201);

    const first = await api.call("GET", "/api/complaints", { token: someone.token });
    assert.equal(first.json.items.length, 20);
    assert.deepEqual([first.json.page, first.json.limit, first.json.total, first.json.hasMore], [1, 20, 25, true]);
    const second = await api.call("GET", "/api/complaints?page=2", { token: someone.token });
    assert.equal(second.json.items.length, 5);
    assert.equal(second.json.hasMore, false);
    const ids = [...first.json.items, ...second.json.items].map((c) => c.id);
    assert.equal(new Set(ids).size, 25, "no complaint is skipped or repeated across pages");

    const small = await Promise.all([1, 2, 3, 4, 5].map((p) => api.call("GET", `/api/complaints?page=${p}&limit=5`, { token: someone.token })));
    assert.deepEqual(small.flatMap((r) => r.json.items.map((c) => c.id)), ids, "same order however it is paged");

    for (const q of ["limit=101", "limit=0", "limit=abc", "page=0", "page=-1", "page=1.5"]) {
      assert.equal((await api.call("GET", `/api/complaints?${q}`, { token: someone.token })).status, 400, q);
    }
    assert.equal((await api.call("GET", "/api/complaints?limit=100", { token: someone.token })).json.items.length, 25);
  });

  test("complaints with the very same timestamp are ordered by id, so pages never overlap", async () => {
    const tied = await api.signIn("cmp-tied");
    const ts = "2026-03-01T10:00:00.000Z";
    const ids = Array.from({ length: 30 }, (_, i) => `SSB2026-${String(5000 + i).padStart(4, "0")}`);
    await t.db.collection("complaints").insertMany(
      ids.map((id) => ({
        _id: id, citizenId: "cmp-tied", citizenName: "T", issueType: "Dirty Area", category: null, description: "Tied",
        location: { address: "x", latitude: 29.89, longitude: 77.96 }, facilityType: null, facilityId: null, priority: "MEDIUM",
        photo: null, status: "SUBMITTED", assignedWorkerId: null, assignedWorkerName: null, resolutionNote: "",
        resolutionPhoto: null, openKey: null, isDemo: false, createdAt: ts, updatedAt: ts,
      }))
    );
    const pages = await Promise.all([1, 2, 3, 4].map((p) => api.call("GET", `/api/complaints?page=${p}&limit=8`, { token: tied.token })));
    const seen = pages.flatMap((r) => r.json.items.map((c) => c.id));
    assert.deepEqual(seen, [...ids].reverse(), "newest first, then highest id first, with no repeats");
  });
});

describe("votes", () => {
  test("one vote per user per complaint: voting again changes it, null removes it", async () => {
    const c = (await create(citizenA, { ...GENERAL, description: "Voting test complaint" })).json.complaint.id;
    const vote = (direction) => api.call("POST", `/api/complaints/${c}/vote`, { token: citizenA.token, body: { direction } });

    let res = await vote("up");
    assert.equal(res.status, 200);
    assert.deepEqual([res.json.complaint.upvotes, res.json.complaint.downvotes, res.json.complaint.myVote], [1, 0, "up"]);
    res = await vote("up");
    assert.deepEqual([res.json.complaint.upvotes, res.json.complaint.myVote], [1, "up"]);
    res = await vote("down");
    assert.deepEqual([res.json.complaint.upvotes, res.json.complaint.downvotes, res.json.complaint.myVote], [0, 1, "down"]);
    res = await vote(null);
    assert.deepEqual([res.json.complaint.upvotes, res.json.complaint.downvotes, res.json.complaint.myVote], [0, 0, null]);

    await Promise.all([vote("up"), vote("up"), vote("down"), vote("up")]);
    assert.equal(await t.db.collection("complaint_votes").countDocuments({ complaintId: c }), 1, "never two votes from one user");
    assert.ok((await t.db.collection("complaint_votes").indexes()).some((i) => i.unique && i.key.complaintId === 1 && i.key.userId === 1));

    assert.equal((await vote("sideways")).status, 400);
    assert.equal((await api.call("POST", `/api/complaints/${c}/vote`, { token: citizenB.token, body: { direction: "up" } })).status, 404, "someone else's complaint");
  });
});

describe("per-user rate limit", () => {
  test("creating complaints is limited per user, not per IP", async () => {
    const small = await startTestServer({ ECOSETU_COMPLAINT_RATE_MAX: "3" });
    try {
      const a = apiClient(small);
      const one = await a.signIn("rl-1");
      const two = await a.signIn("rl-2");
      const make = (who, i) => a.call("POST", "/api/complaints", { token: who.token, body: { ...GENERAL, description: `Rate limit ${i}` } });
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push((await make(one, i)).status);
      assert.deepEqual(statuses, [201, 201, 201, 429, 429]);
      assert.equal((await make(two, 9)).status, 201, "another user from the same IP is not affected");
      assert.ok(await small.db.collection("auth_rate_limits").findOne({ _id: "complaint:rl-1" }));
    } finally {
      await small.stop();
    }
  });
});
