import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { openDatabase, createRepository } from "../src/db.js";
import { seedIfEmpty } from "../src/seed.js";
import { createApp } from "../src/app.js";
import { signToken } from "../src/auth.js";

const CODES = {
  ECOSETU_JWT_SECRET: "test-secret-test-secret",
  ECOSETU_CODE_WORKER: "w-code",
  ECOSETU_CODE_SUPERVISOR: "s-code",
  ECOSETU_CODE_OFFICIAL: "o-code",
  ECOSETU_CODE_SUPERADMIN: "a-code",
};

let server;
let base;
let config;

before(async () => {
  config = loadConfig({ ...CODES, ECOSETU_REQUIRE_ACCESS_CODES: "true" });
  const repo = createRepository(openDatabase(":memory:"));
  seedIfEmpty(repo, { demo: true });
  server = createApp({ config, repo }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, { token, body, raw } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined || raw ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, json };
}

async function login(role, extra = {}) {
  const codes = { worker: "w-code", supervisor: "s-code", official: "o-code", superadmin: "a-code" };
  const res = await call("POST", "/api/auth/login", {
    body: { role, mobile: "9876543210", accessCode: codes[role], ...extra },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.token;
}

const BIN = {
  name: "Test Bin",
  type: "dustbin",
  latitude: 29.8905551,
  longitude: 77.9601633,
  address: "Near test block",
  details: { wasteType: "Dry Waste", fillLevel: 40 },
};

const REQ = {
  facilityType: "Dustbin",
  suggestedName: "Bin by workshop",
  location: { address: "Workshop road", latitude: 29.8899, longitude: 77.96 },
  reason: "Waste piles up here daily",
  priority: "HIGH",
  requestedByWorkerId: "w1",
  requestedByWorkerName: "Vikash Kumar",
};

describe("authentication", () => {
  test("citizen can sign in without a code", async () => {
    const res = await call("POST", "/api/auth/login", { body: { role: "citizen", mobile: "9876543210" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.role, "citizen");
  });

  test("privileged roles need the correct access code", async () => {
    for (const role of ["worker", "supervisor", "official", "superadmin"]) {
      const bad = await call("POST", "/api/auth/login", { body: { role, mobile: "9876543210", accessCode: "nope" } });
      assert.equal(bad.status, 401, role);
      const none = await call("POST", "/api/auth/login", { body: { role, mobile: "9876543210" } });
      assert.equal(none.status, 401, role);
    }
  });

  test("rejects unknown roles and bad mobile numbers", async () => {
    assert.equal((await call("POST", "/api/auth/login", { body: { role: "root", mobile: "9876543210" } })).status, 400);
    assert.equal((await call("POST", "/api/auth/login", { body: { role: "citizen", mobile: "123" } })).status, 400);
  });

  test("tampered, expired and malformed tokens are rejected", async () => {
    const good = await login("official");
    const [h, p, s] = good.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "x", role: "superadmin", exp: 9999999999 })).toString("base64url");
    assert.equal((await call("GET", "/api/locations/removed", { token: `${h}.${forgedPayload}.${s}` })).status, 401);
    assert.equal((await call("GET", "/api/locations/removed", { token: `${h}.${p}.AAAA` })).status, 401);
    assert.equal((await call("GET", "/api/locations/removed", { token: "garbage" })).status, 401);
    const expired = signToken({ sub: "o", role: "official", name: "o" }, config.jwtSecret, -10);
    assert.equal((await call("GET", "/api/locations/removed", { token: expired })).status, 401);
  });

  test("a token signed with another secret is rejected", async () => {
    const forged = signToken({ sub: "o", role: "official", name: "o" }, "another-secret-another", 600);
    assert.equal((await call("POST", "/api/locations", { token: forged, body: BIN })).status, 401);
  });
});

describe("locations (shared source of truth)", () => {
  test("public read returns the verified campus and clearly flagged demo data", async () => {
    const res = await call("GET", "/api/locations");
    assert.equal(res.status, 200);
    const list = res.json.locations;
    const campus = list.find((l) => l.type === "campus");
    assert.ok(campus);
    assert.equal(campus.isDemo, false);
    assert.equal(campus.source, "verified");
    const demo = list.filter((l) => l.isDemo);
    assert.ok(demo.length >= 10);
    assert.ok(demo.every((l) => l.description.startsWith("DEMO")));
    for (const type of ["library", "hostel", "canteen", "main_gate"]) {
      assert.ok(list.some((l) => l.type === type), `missing type ${type}`);
    }
  });

  test("no demo dustbins or public toilets are seeded", async () => {
    const list = (await call("GET", "/api/locations")).json.locations;
    assert.ok(!list.some((l) => l.isDemo && (l.type === "dustbin" || l.type === "public_toilet")));
  });

  test("markers are stored at the exact coordinates that were saved", async () => {
    const official = await login("official");
    const res = await call("POST", "/api/locations", {
      token: official,
      body: { ...BIN, name: "Exact", latitude: 29.8905551, longitude: 77.9601633 },
    });
    assert.equal(res.status, 201);
    const fetched = (await call("GET", "/api/locations")).json.locations.find((l) => l.id === res.json.location.id);
    assert.equal(fetched.latitude, 29.8905551);
    assert.equal(fetched.longitude, 77.9601633);
  });

  test("filter by type and search by name", async () => {
    const hostels = (await call("GET", "/api/locations?type=hostel")).json.locations;
    assert.ok(hostels.length > 0 && hostels.every((l) => l.type === "hostel"));
    const lib = (await call("GET", "/api/locations?q=library")).json.locations;
    assert.ok(lib.some((l) => l.type === "library"));
    assert.equal((await call("GET", "/api/locations?type=spaceship")).status, 400);
  });

  test("citizens, workers and supervisors cannot create, edit or delete", async () => {
    const citizen = (await call("POST", "/api/auth/login", { body: { role: "citizen", mobile: "9876543210" } })).json.token;
    const worker = await login("worker");
    const supervisor = await login("supervisor");
    const target = (await call("GET", "/api/locations?type=library")).json.locations[0];

    for (const token of [citizen, worker, supervisor]) {
      assert.equal((await call("POST", "/api/locations", { token, body: BIN })).status, 403);
      assert.equal((await call("PATCH", `/api/locations/${target.id}`, { token, body: { name: "Hacked" } })).status, 403);
      assert.equal((await call("DELETE", `/api/locations/${target.id}`, { token, body: {} })).status, 403);
    }
    assert.equal((await call("POST", "/api/locations", { body: BIN })).status, 401);
    assert.equal((await call("GET", "/api/locations?type=library")).json.locations.find((l) => l.id === target.id).name, target.name);
  });

  test("an official-added facility is immediately visible to citizens", async () => {
    const official = await login("official");
    const created = await call("POST", "/api/locations", {
      token: official,
      body: { ...BIN, name: "Visible To Citizens" },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.location.source, "government");
    assert.equal(created.json.location.isDemo, false);
    const publicList = (await call("GET", "/api/locations")).json.locations;
    assert.ok(publicList.some((l) => l.name === "Visible To Citizens"));
  });

  test("validation: coordinates, type, status and required fields", async () => {
    const official = await login("official");
    const bad = [
      [{ ...BIN, latitude: 91 }, "latitude"],
      [{ ...BIN, latitude: -91 }, "latitude"],
      [{ ...BIN, longitude: 181 }, "longitude"],
      [{ ...BIN, longitude: "abc" }, "longitude"],
      [{ ...BIN, latitude: null }, "latitude"],
      [{ ...BIN, name: "   " }, "name"],
      [{ ...BIN, type: "bakery" }, "type"],
      [{ ...BIN, type: "campus" }, "type"],
      [{ ...BIN, status: "exploded" }, "status"],
      [{ ...BIN, details: { fillLevel: 140 } }, "fillLevel"],
    ];
    for (const [body, field] of bad) {
      const res = await call("POST", "/api/locations", { token: official, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.json.fields[field], `expected error on ${field}`);
    }
    // boundary values are accepted
    const ok = await call("POST", "/api/locations", {
      token: official,
      body: { ...BIN, name: "Edge", latitude: -90, longitude: 180 },
    });
    assert.equal(ok.status, 201);
  });

  test("input is sanitised (markup and control characters stripped)", async () => {
    const official = await login("official");
    const res = await call("POST", "/api/locations", {
      token: official,
      body: { ...BIN, name: "<script>alert(1)</script>Bin\u0000", address: "<b>x</b>" },
    });
    assert.equal(res.status, 201);
    assert.ok(!/[<>\u0000]/.test(res.json.location.name));
    assert.ok(!/[<>]/.test(res.json.location.address));
  });

  test("malformed JSON and unknown ids give clean errors", async () => {
    const official = await login("official");
    const bad = await call("POST", "/api/locations", { token: official, raw: "{not json" });
    assert.equal(bad.status, 400);
    assert.equal((await call("PATCH", "/api/locations/NOPE-1", { token: official, body: { name: "x" } })).status, 404);
    assert.equal((await call("DELETE", "/api/locations/NOPE-1", { token: official, body: {} })).status, 404);
    assert.equal((await call("GET", "/api/nope")).status, 404);
  });

  test("edit changes the stored data and bumps updatedAt", async () => {
    const official = await login("official");
    const { location } = (await call("POST", "/api/locations", { token: official, body: { ...BIN, name: "Before" } })).json;
    await new Promise((r) => setTimeout(r, 5));
    const res = await call("PATCH", `/api/locations/${location.id}`, {
      token: official,
      body: { name: "After", latitude: 29.8911, details: { fillLevel: 95 } },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.location.name, "After");
    assert.equal(res.json.location.latitude, 29.8911);
    assert.equal(res.json.location.longitude, location.longitude);
    assert.equal(res.json.location.status, "overflow"); // follows the new fill level
    assert.notEqual(res.json.location.updatedAt, location.updatedAt);
    const bad = await call("PATCH", `/api/locations/${location.id}`, { token: official, body: { latitude: 200 } });
    assert.equal(bad.status, 400);
    const wrongGroup = await call("PATCH", `/api/locations/${location.id}`, { token: official, body: { type: "library" } });
    assert.equal(wrongGroup.status, 400);
  });

  test("delete hides a location from citizens and can be restored", async () => {
    const official = await login("official");
    const { location } = (await call("POST", "/api/locations", { token: official, body: { ...BIN, name: "Temp" } })).json;
    const del = await call("DELETE", `/api/locations/${location.id}`, { token: official, body: { reason: "Duplicate entry" } });
    assert.equal(del.status, 200);
    assert.ok(!(await call("GET", "/api/locations")).json.locations.some((l) => l.id === location.id));
    const removed = (await call("GET", "/api/locations/removed", { token: official })).json.locations;
    const record = removed.find((l) => l.id === location.id);
    assert.equal(record.removalReason, "Duplicate entry");
    assert.equal((await call("DELETE", `/api/locations/${location.id}`, { token: official, body: {} })).status, 404);
    const back = await call("POST", `/api/locations/${location.id}/restore`, { token: official });
    assert.equal(back.status, 200);
    assert.ok((await call("GET", "/api/locations")).json.locations.some((l) => l.id === location.id));
    assert.equal((await call("POST", `/api/locations/${location.id}/restore`, { token: official })).status, 404);
  });

  test("the verified campus reference is protected", async () => {
    const official = await login("official");
    const campus = (await call("GET", "/api/locations?type=campus")).json.locations[0];
    assert.equal((await call("PATCH", `/api/locations/${campus.id}`, { token: official, body: { name: "x" } })).status, 403);
    assert.equal((await call("DELETE", `/api/locations/${campus.id}`, { token: official, body: {} })).status, 403);
  });

  test("only officials can read the removed list", async () => {
    const worker = await login("worker");
    assert.equal((await call("GET", "/api/locations/removed", { token: worker })).status, 403);
    assert.equal((await call("GET", "/api/locations/removed")).status, 401);
  });
});

describe("worker request → official approval workflow", () => {
  test("worker submits, official approves, citizens see the facility", async () => {
    const worker = await login("worker", { workerId: "w1" });
    const official = await login("official");

    const created = await call("POST", "/api/facility-requests", { token: worker, body: { ...REQ, suggestedName: "Workflow Bin" } });
    assert.equal(created.status, 201);
    assert.equal(created.json.request.status, "PENDING");
    const id = created.json.request.id;

    assert.ok(!(await call("GET", "/api/locations")).json.locations.some((l) => l.name === "Workflow Bin"));

    const mine = (await call("GET", "/api/facility-requests", { token: worker })).json.requests;
    assert.ok(mine.some((r) => r.id === id));

    const approved = await call("PATCH", `/api/facility-requests/${id}/status`, { token: official, body: { status: "APPROVED" } });
    assert.equal(approved.status, 200);
    assert.equal(approved.json.request.status, "APPROVED");
    assert.equal(approved.json.location.source, "worker_approved");

    const visible = (await call("GET", "/api/locations")).json.locations.find((l) => l.requestId === id);
    assert.ok(visible);
    assert.equal(visible.latitude, 29.8899);
    assert.equal(visible.type, "dustbin");

    // cannot be approved or rejected twice
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: official, body: { status: "APPROVED" } })).status, 409);
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: official, body: { status: "REJECTED", rejectionReason: "x y z" } })).status, 409);
    assert.equal((await call("GET", "/api/locations")).json.locations.filter((l) => l.requestId === id).length, 1);
  });

  test("rejection needs a reason and creates no facility", async () => {
    const worker = await login("worker");
    const official = await login("official");
    const id = (await call("POST", "/api/facility-requests", { token: worker, body: { ...REQ, suggestedName: "Rejected Bin" } })).json.request.id;
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: official, body: { status: "REJECTED" } })).status, 400);
    const rej = await call("PATCH", `/api/facility-requests/${id}/status`, {
      token: official,
      body: { status: "REJECTED", rejectionReason: "Too close to an existing bin" },
    });
    assert.equal(rej.status, 200);
    assert.equal(rej.json.request.rejectionReason, "Too close to an existing bin");
    assert.ok(!(await call("GET", "/api/locations")).json.locations.some((l) => l.name === "Rejected Bin"));
  });

  test("workers and citizens cannot approve; supervisors can only mark under review", async () => {
    const worker = await login("worker");
    const supervisor = await login("supervisor");
    const citizen = (await call("POST", "/api/auth/login", { body: { role: "citizen", mobile: "9876543210" } })).json.token;
    const id = (await call("POST", "/api/facility-requests", { token: worker, body: { ...REQ, suggestedName: "Perm Bin" } })).json.request.id;

    for (const token of [worker, citizen]) {
      assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token, body: { status: "APPROVED" } })).status, 403);
    }
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: supervisor, body: { status: "APPROVED" } })).status, 403);
    const review = await call("PATCH", `/api/facility-requests/${id}/status`, { token: supervisor, body: { status: "UNDER_REVIEW" } });
    assert.equal(review.status, 200);
    assert.equal(review.json.request.status, "UNDER_REVIEW");
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { body: { status: "APPROVED" } })).status, 401);
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: supervisor, body: { status: "BANANA" } })).status, 400);
  });

  test("citizens cannot create or list requests", async () => {
    const citizen = (await call("POST", "/api/auth/login", { body: { role: "citizen", mobile: "9876543210" } })).json.token;
    assert.equal((await call("POST", "/api/facility-requests", { token: citizen, body: REQ })).status, 403);
    assert.equal((await call("GET", "/api/facility-requests", { token: citizen })).status, 403);
    assert.equal((await call("GET", "/api/facility-requests")).status, 401);
  });

  test("a worker only sees their own requests; officials see all", async () => {
    const a = (await call("POST", "/api/auth/login", { body: { role: "worker", mobile: "9000000001", accessCode: "w-code", workerId: "w1" } })).json.token;
    const b = (await call("POST", "/api/auth/login", { body: { role: "worker", mobile: "9000000002", accessCode: "w-code", workerId: "w2" } })).json.token;
    const official = await login("official");
    const idA = (await call("POST", "/api/facility-requests", { token: a, body: { ...REQ, suggestedName: "A's Bin" } })).json.request.id;
    const idB = (await call("POST", "/api/facility-requests", { token: b, body: { ...REQ, suggestedName: "B's Bin" } })).json.request.id;

    const aList = (await call("GET", "/api/facility-requests", { token: a })).json.requests.map((r) => r.id);
    assert.ok(aList.includes(idA) && !aList.includes(idB));
    assert.equal((await call("GET", `/api/facility-requests/${idB}`, { token: a })).status, 403);
    assert.equal((await call("GET", `/api/facility-requests/${idA}`, { token: a })).status, 200);
    const all = (await call("GET", "/api/facility-requests", { token: official })).json.requests.map((r) => r.id);
    assert.ok(all.includes(idA) && all.includes(idB));
  });

  test("request validation: coordinates, reason, photo, worker id", async () => {
    const worker = await login("worker");
    const cases = [
      [{ ...REQ, location: { ...REQ.location, latitude: 120 } }, "latitude"],
      [{ ...REQ, location: { ...REQ.location, longitude: -181 } }, "longitude"],
      [{ ...REQ, reason: "x" }, "reason"],
      [{ ...REQ, facilityType: "Fountain" }, "facilityType"],
      [{ ...REQ, photo: "data:text/html;base64,PHNjcmlwdD4=" }, "photo"],
      [{ ...REQ, requestedByWorkerId: "../etc" }, "requestedByWorkerId"],
      [{ ...REQ, priority: "URGENT" }, "priority"],
    ];
    for (const [body, field] of cases) {
      const res = await call("POST", "/api/facility-requests", { token: worker, body });
      assert.equal(res.status, 400, field);
      assert.ok(res.json.fields[field], field);
    }
  });

  test("seeded demo requests are present and publish nothing", async () => {
    const official = await login("official");
    const list = (await call("GET", "/api/facility-requests", { token: official })).json.requests;
    assert.ok(list.some((r) => r.id === "FR-2026-001" && r.status === "PENDING"));
    assert.ok(list.some((r) => r.id === "FR-2026-003" && r.status === "REJECTED"));
    const locations = (await call("GET", "/api/locations")).json.locations;
    assert.ok(!locations.some((l) => ["FR-2026-001", "FR-2026-003"].includes(l.requestId)));
  });
});

describe("login rate limiting", () => {
  test("repeated wrong access codes are throttled", async () => {
    let last;
    for (let i = 0; i < 12; i++) {
      last = await call("POST", "/api/auth/login", { body: { role: "official", mobile: "9876543210", accessCode: `bad${i}` } });
    }
    assert.equal(last.status, 429);
  });
});
