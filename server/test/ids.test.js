// Complaint and facility-request ids carry the year they were created in
// (India time), instead of a hard-coded "2026".

import { test, before, after, describe, mock } from "node:test";
import assert from "node:assert/strict";
import { complaintIdPrefix, idYear, requestIdPrefix } from "../src/ids.js";
import { seedAll } from "../src/seed.js";
import { DEMO_REQUESTS } from "../src/seed-data.js";
import { apiClient, startTestServer } from "./helpers.js";

describe("idYear", () => {
  test("is the year in India, not in UTC", () => {
    assert.equal(idYear(new Date("2026-12-31T18:29:59Z")), 2026); // 23:59:59 IST
    assert.equal(idYear(new Date("2026-12-31T18:30:00Z")), 2027); // 00:00 IST, 1 Jan
    assert.equal(idYear("2027-06-01T00:00:00.000Z"), 2027);
    assert.equal(idYear(Date.parse("2028-01-01T00:00:00+05:30")), 2028);
  });

  test("builds the two prefixes", () => {
    const at = new Date("2027-05-05T12:00:00Z");
    assert.equal(complaintIdPrefix(at), "SSB2027-");
    assert.equal(requestIdPrefix(at), "FR-2027-");
  });

  test("refuses a time that isn't one", () => {
    assert.throws(() => idYear("not a date"), TypeError);
  });
});

describe("ids created in 2027", () => {
  let t;
  let api;

  before(async () => {
    t = await startTestServer({ ECOSETU_COMPLAINT_RATE_MAX: "1000" });
    await seedAll(t.repo, { demo: true }); // FR-2026-001.. already exist
    api = apiClient(t);
  });
  after(() => {
    mock.timers.reset();
    return t.stop();
  });

  test("a complaint and a facility request made in 2027 get 2027 ids numbered from 1; 2026 ids are kept", async () => {
    // A 2026 complaint first, so its counter exists and must not leak into 2027.
    const citizen2026 = await api.signIn("ids-citizen-2026");
    const old = await api.call("POST", "/api/complaints", {
      token: citizen2026.token,
      body: { issueType: "Dirty Area", description: "Garbage piled up beside the road", location: { address: "Main gate", latitude: 29.8886, longitude: 77.959 } },
    });
    assert.equal(old.status, 201, JSON.stringify(old.json));
    assert.match(old.json.complaint.id, new RegExp(`^SSB${idYear()}-\\d{4}$`));

    // Only Date is mocked: timers, the database and the network run as normal.
    mock.timers.enable({ apis: ["Date"], now: new Date("2027-01-15T10:00:00+05:30") });
    try {
      const citizen = await api.signIn("ids-citizen"); // tokens issued "in 2027"
      const worker = await api.signIn("ids-worker", { role: "worker", workerId: "w1", name: "Vikash Kumar" });

      const body = { issueType: "Dirty Area", description: "Garbage piled up beside the road", location: { address: "Main gate", latitude: 29.8886, longitude: 77.959 } };
      const c1 = await api.call("POST", "/api/complaints", { token: citizen.token, body });
      const c2 = await api.call("POST", "/api/complaints", { token: citizen.token, body: { ...body, description: "More garbage piled up beside the road" } });
      assert.equal(c1.status, 201, JSON.stringify(c1.json));
      assert.deepEqual([c1.json.complaint.id, c2.json.complaint.id], ["SSB2027-0001", "SSB2027-0002"]);

      const req = {
        facilityType: "Dustbin",
        suggestedName: "Bin by workshop",
        location: { address: "Workshop road", latitude: 29.8899, longitude: 77.96 },
        reason: "Waste piles up here daily",
        priority: "HIGH",
        requestedByWorkerId: "w1",
        requestedByWorkerName: "Vikash Kumar",
      };
      const r1 = await api.call("POST", "/api/facility-requests", { token: worker.token, body: req });
      const r2 = await api.call("POST", "/api/facility-requests", { token: worker.token, body: { ...req, suggestedName: "Second bin" } });
      assert.equal(r1.status, 201, JSON.stringify(r1.json));
      assert.deepEqual([r1.json.request.id, r2.json.request.id], ["FR-2027-001", "FR-2027-002"]);

      // The 2026 records are untouched and still found by their ids.
      const list = await api.listAll("/api/facility-requests", "requests", worker.token);
      for (const r of DEMO_REQUESTS) assert.ok(list.some((x) => x.id === r.id), `${r.id} kept`);
      const stillThere = await api.call("GET", `/api/complaints/${old.json.complaint.id}`, { token: citizen2026.token });
      assert.notEqual(stillThere.status, 404);
    } finally {
      mock.timers.reset();
    }
  });
});
