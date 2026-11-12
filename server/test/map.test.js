// GET /api/locations/map: every active bin and toilet, slim, in one response.
// GET /api/locations/:id: one full record, for detail screens.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { seedAll } from "../src/seed.js";
import { DEMO_BINS, DEMO_TOILETS } from "../src/seed-data.js";
import { apiClient, startTestServer } from "./helpers.js";

let t;
let api;
before(async () => {
  t = await startTestServer();
  await seedAll(t.repo, { demo: true });
  api = apiClient(t);
});
after(() => t.stop());

test("lists every active bin and toilet with only the fields the map needs", async () => {
  const official = await api.signIn("map-official", { role: "official" });
  const gone = (await api.call("POST", "/api/locations", { token: official.token, body: { name: "Removed bin", type: "dustbin", latitude: 29.89, longitude: 77.96, address: "x" } })).json.location;
  await api.call("DELETE", `/api/locations/${gone.id}`, { token: official.token, body: { reason: "Test" } });

  const res = await fetch(`${t.base}/api/locations/map`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control"), /^public, max-age=30/);
  const json = await res.json();
  assert.equal(json.truncated, false);
  assert.equal(json.total, json.items.length);

  const ids = json.items.map((i) => i.id);
  for (const l of [...DEMO_BINS, ...DEMO_TOILETS]) assert.ok(ids.includes(l.id), l.id);
  assert.ok(!ids.includes(gone.id), "removed facilities are left out");
  assert.ok(json.items.every((i) => i.type === "dustbin" || i.type === "public_toilet"), "no buildings or campus");

  const bin = json.items.find((i) => i.id === DEMO_BINS[0].id);
  assert.deepEqual(Object.keys(bin).sort(), ["id", "isDemo", "latitude", "longitude", "name", "ratingAverage", "status", "statusSource", "type"]);
  assert.equal(bin.ratingAverage, null);
  assert.ok(!JSON.stringify(json).includes("createdBy"), "no record-keeping fields");
});

test("the publicly cached response is the same for everyone and holds nothing about the requester", async () => {
  const c = await api.signIn("map-viewer");
  await api.call("PUT", `/api/toilets/${DEMO_TOILETS[2].id}/rating`, { token: c.token, body: { stars: 2, comment: "Mine" } });
  const anonymous = await (await fetch(`${t.base}/api/locations/map`)).text();
  const signedIn = await (await fetch(`${t.base}/api/locations/map`, { headers: { Authorization: `Bearer ${c.token}` } })).text();
  const official = await api.signIn("map-official-2", { role: "official" });
  const asOfficial = await (await fetch(`${t.base}/api/locations/map`, { headers: { Authorization: `Bearer ${official.token}` } })).text();
  assert.equal(signedIn, anonymous, "identical bytes with or without a user");
  assert.equal(asOfficial, anonymous, "identical for every role");
  assert.ok(!signedIn.includes("map-viewer") && !signedIn.includes("Mine"), "nothing the viewer wrote or is");
  for (const item of JSON.parse(anonymous).items) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "isDemo", "latitude", "longitude", "name", "ratingAverage", "status", "statusSource", "type"]);
  }
});

test("toilets carry their rating average", async () => {
  const toilet = DEMO_TOILETS[0].id;
  for (const [i, stars] of [3, 4].entries()) {
    const c = await api.signIn(`map-rater-${i}`);
    await api.call("PUT", `/api/toilets/${toilet}/rating`, { token: c.token, body: { stars } });
  }
  const json = await (await fetch(`${t.base}/api/locations/map`)).json();
  assert.equal(json.items.find((i) => i.id === toilet).ratingAverage, 3.5);
  assert.equal(json.items.find((i) => i.id === DEMO_TOILETS[1].id).ratingAverage, null);
});

test("is capped (2,000 by default) and says when it was cut short", async () => {
  const small = await startTestServer({ ECOSETU_MAP_LIMIT: "5" });
  try {
    await seedAll(small.repo, { demo: true });
    const json = await (await fetch(`${small.base}/api/locations/map`)).json();
    assert.equal(json.items.length, 5);
    assert.equal(json.truncated, true);
    assert.equal(json.total, DEMO_BINS.length + DEMO_TOILETS.length);
  } finally {
    await small.stop();
  }
  assert.equal(t.config.mapLimit, 2000);
});

test("one location in full, for detail screens; removed or unknown ones are 404", async () => {
  const res = await api.call("GET", `/api/locations/${DEMO_BINS[0].id}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.location.address, DEMO_BINS[0].address);
  assert.equal(res.json.location.details.wasteType, DEMO_BINS[0].details.wasteType);
  assert.equal((await api.call("GET", "/api/locations/DB-999")).status, 404);
});

test("?kind=building and ?kind=facility filter the full list", async () => {
  const buildings = await api.listAll("/api/locations?kind=building", "locations");
  assert.ok(buildings.length >= 11);
  assert.ok(buildings.every((l) => l.type !== "dustbin" && l.type !== "public_toilet"));
  const facilities = await api.listAll("/api/locations?kind=facility", "locations");
  assert.ok(facilities.length >= DEMO_BINS.length + DEMO_TOILETS.length);
  assert.ok(facilities.every((l) => l.type === "dustbin" || l.type === "public_toilet"));
  assert.ok(facilities[0].address !== undefined, "full records");
  assert.equal((await api.call("GET", "/api/locations?kind=planet")).status, 400);
  assert.equal((await api.call("GET", "/api/locations?kind=building&type=dustbin")).status, 400);
});
