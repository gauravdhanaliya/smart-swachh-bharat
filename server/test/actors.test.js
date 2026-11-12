// Records that show an official's or worker's name also store their user id,
// and "delete my data" anonymises by that id — never by matching the name.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { seedAll } from "../src/seed.js";
import { apiClient, startTestServer } from "./helpers.js";

let t;
let api;
before(async () => {
  t = await startTestServer();
  await seedAll(t.repo, { demo: true });
  api = apiClient(t);
});
after(() => t.stop());

const BIN = (name) => ({ name, type: "dustbin", latitude: 29.89, longitude: 77.96, address: "x" });
const REQUEST = (name) => ({
  facilityType: "Dustbin",
  suggestedName: name,
  location: { address: "Road", latitude: 29.8899, longitude: 77.96 },
  reason: "Waste piles up here daily",
  priority: "LOW",
  requestedByWorkerId: "w1",
  requestedByWorkerName: "Same Worker",
});

test("two officials with the same name: deleting one leaves the other's records untouched", async () => {
  const a = await api.signIn("same-name-a", { role: "official", name: "Officer Same" });
  const b = await api.signIn("same-name-b", { role: "official", name: "Officer Same" });
  const worker = await api.signIn("same-name-worker", { role: "worker", workerId: "w1", name: "Vikash Kumar" });

  // each official creates one location, removes one, and reviews one request
  const act = async (who, tag) => {
    const made = (await api.call("POST", "/api/locations", { token: who.token, body: BIN(`${tag} made`) })).json.location;
    const gone = (await api.call("POST", "/api/locations", { token: who.token, body: BIN(`${tag} gone`) })).json.location;
    await api.call("DELETE", `/api/locations/${gone.id}`, { token: who.token, body: { reason: "Test" } });
    const req = (await api.call("POST", "/api/facility-requests", { token: worker.token, body: REQUEST(`${tag} request`) })).json.request;
    await api.call("PATCH", `/api/facility-requests/${req.id}/status`, { token: who.token, body: { status: "APPROVED" } });
    return { made: made.id, gone: gone.id, req: req.id };
  };
  const ra = await act(a, "A");
  const rb = await act(b, "B");

  const locations = t.db.collection("locations");
  const requests = t.db.collection("facility_requests");
  assert.equal((await locations.findOne({ _id: ra.made })).createdById, "same-name-a", "the actor's id is stored next to the name");
  assert.equal((await requests.findOne({ _id: rb.req })).reviewedById, "same-name-b");

  assert.equal((await api.call("DELETE", "/api/me/data", { token: a.token, body: { confirm: true } })).status, 200);

  // A's records are anonymised…
  assert.deepEqual(await field(locations, ra.made, "createdBy", "createdById"), ["Deleted user", "deleted-user"]);
  assert.deepEqual(await field(locations, ra.gone, "deletedBy", "deletedById"), ["Deleted user", "deleted-user"]);
  assert.deepEqual(await field(requests, ra.req, "reviewedBy", "reviewedById"), ["Deleted user", "deleted-user"]);
  const published = await locations.findOne({ requestId: ra.req });
  assert.deepEqual([published.createdBy, published.createdById], ["Deleted user", "deleted-user"], "the location an approval published too");

  // …and B's, with the very same display name, are not
  assert.deepEqual(await field(locations, rb.made, "createdBy", "createdById"), ["Officer Same", "same-name-b"]);
  assert.deepEqual(await field(locations, rb.gone, "deletedBy", "deletedById"), ["Officer Same", "same-name-b"]);
  assert.deepEqual(await field(requests, rb.req, "reviewedBy", "reviewedById"), ["Officer Same", "same-name-b"]);
  const publishedB = await locations.findOne({ requestId: rb.req });
  assert.deepEqual([publishedB.createdBy, publishedB.createdById], ["Officer Same", "same-name-b"]);
});

test("two workers with the same name: only the leaver's assigned complaints are anonymised", async () => {
  const official = await api.signIn("assigner", { role: "official" });
  const leaver = await api.signIn("same-worker-a", { role: "worker", workerId: "w5", name: "Ravi" });
  const stayer = await api.signIn("same-worker-b", { role: "worker", workerId: "w6", name: "Ravi" });
  assert.ok(stayer);
  const citizen = await api.signIn("assign-citizen");
  const body = { issueType: "Dirty Area", description: "Needs clearing", location: { address: "x", latitude: 29.89, longitude: 77.96 } };
  const c1 = (await api.call("POST", "/api/complaints", { token: citizen.token, body })).json.complaint.id;
  const c2 = (await api.call("POST", "/api/complaints", { token: citizen.token, body })).json.complaint.id;
  await api.call("POST", `/api/complaints/${c1}/assign`, { token: official.token, body: { workerId: "w5" } });
  await api.call("POST", `/api/complaints/${c2}/assign`, { token: official.token, body: { workerId: "w6" } });
  const complaints = t.db.collection("complaints");
  assert.equal((await complaints.findOne({ _id: c1 })).assignedWorkerUid, "same-worker-a");

  assert.equal((await api.call("DELETE", "/api/me/data", { token: leaver.token, body: { confirm: true } })).status, 200);
  assert.deepEqual(await field(complaints, c1, "assignedWorkerName", "assignedWorkerUid"), ["Deleted user", "deleted-user"]);
  assert.deepEqual(await field(complaints, c2, "assignedWorkerName", "assignedWorkerUid"), ["Ravi", "same-worker-b"]);
});

test("user ids stored for anonymisation are never sent to clients", async () => {
  const official = await api.signIn("id-hider", { role: "official", name: "Hider" });
  const made = await api.call("POST", "/api/locations", { token: official.token, body: BIN("Hidden id") });
  assert.ok(!JSON.stringify(made.json).includes("id-hider"));
  const list = await api.listAll("/api/locations/removed", "locations", official.token);
  assert.ok(!JSON.stringify(list).includes("same-name-b"));
});

async function field(collection, id, name, idField) {
  const doc = await collection.findOne({ _id: id });
  return [doc[name], doc[idField]];
}
