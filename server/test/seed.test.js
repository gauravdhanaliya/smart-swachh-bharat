import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { seedAll, seedIfEmpty } from "../src/seed.js";
import { CAMPUS, DEMO_BINS, DEMO_TOILETS, DEMO_USERS } from "../src/seed-data.js";
import { runScript, startTestServer } from "./helpers.js";

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.stop());

beforeEach(async () => {
  for (const c of ["locations", "facility_requests", "users", "counters"]) await t.db.collection(c).deleteMany({});
});

const inBox = (l) => {
  const b = CAMPUS.details.bbox;
  return l.latitude >= b.south && l.latitude <= b.north && l.longitude >= b.west && l.longitude <= b.east;
};

test("seeds the campus, demo buildings, demo bins, demo toilets, demo requests and demo users", async () => {
  const first = await seedAll(t.repo, { demo: true });
  assert.ok(first.inserted.locations >= 1 + 11 + DEMO_BINS.length + DEMO_TOILETS.length);
  assert.equal(first.inserted.requests, 2);
  assert.equal(first.inserted.users, DEMO_USERS.length);

  const locations = await t.repo.listLocations();
  const bins = locations.filter((l) => l.type === "dustbin");
  const toilets = locations.filter((l) => l.type === "public_toilet");
  assert.ok(bins.length >= 6, "enough demo bins to fill the map");
  assert.ok(toilets.length >= 3, "enough demo toilets to rate");
  for (const l of [...bins, ...toilets]) {
    assert.equal(l.isDemo, true);
    assert.equal(l.source, "demo");
    assert.match(l.description, /^DEMO/);
    assert.ok(inBox(l), `${l.id} is inside the campus bounding box`);
  }
  assert.ok(new Set(bins.map((b) => b.status)).size >= 2, "bins start in a mix of statuses");
  assert.ok(bins.every((b) => b.statusSource === "simulated"), "demo bins may be simulated");
  assert.ok(bins.every((b) => !("fillLevel" in b.details)));
  assert.ok(toilets.every((l) => typeof l.details.openingHours === "string" && Array.isArray(l.details.facilities)));

  const worker = await t.repo.getUserByUid("demo-worker");
  assert.deepEqual([worker.role, worker.workerId, worker.phoneMasked], ["worker", "w1", null]);
  assert.equal((await t.repo.getUserByUid("demo-official")).role, "official");
  assert.equal((await t.repo.getUserByUid("demo-citizen")).role, "citizen");
  assert.ok((await t.db.collection("users").find({ isDemo: true }).toArray()).every((u) => u.phoneHash === null));
});

test("running the seed again inserts nothing and keeps changes made in between", async () => {
  await seedAll(t.repo, { demo: true });
  const bin = (await t.repo.listLocations({ type: "dustbin" }))[0];
  await t.repo.updateLocation(bin.id, { ...bin, name: "Renamed by an official", status: "overflow", statusSource: "manual" });
  await t.repo.grantRole({ uid: "demo-citizen", role: "worker", workerId: "w2" });

  const second = await seedAll(t.repo, { demo: true });
  assert.deepEqual(second.inserted, { locations: 0, requests: 0, users: 0 });
  assert.equal(await t.db.collection("locations").countDocuments(), (await t.repo.listLocations()).length);
  const after = await t.repo.getLocation(bin.id);
  assert.equal(after.name, "Renamed by an official");
  assert.equal(after.statusSource, "manual");
  assert.equal((await t.repo.getUserByUid("demo-citizen")).role, "worker", "a later role change survives a re-seed");
});

test("demo data has fixed ids, so a re-seed can never duplicate under a new id", async () => {
  await seedAll(t.repo, { demo: true });
  const ids = (await t.repo.listLocations()).map((l) => l.id);
  assert.ok(ids.includes("CP-001"));
  assert.ok(DEMO_BINS.every((b) => ids.includes(b.id)));
  assert.ok(DEMO_TOILETS.every((p) => ids.includes(p.id)));
  // ids generated afterwards continue past the seeded ones
  const created = await t.repo.createLocation(
    { name: "New", type: "dustbin", latitude: 29.89, longitude: 77.96, description: "", address: "", status: "normal", details: {} },
    "tester"
  );
  assert.ok(!DEMO_BINS.some((b) => b.id === created.id));
  assert.match(created.id, /^DB-\d{3}$/, "generated ids stay numeric");
});

test("without demo data only the verified campus and no users are seeded", async () => {
  const res = await seedAll(t.repo, { demo: false });
  assert.deepEqual(res.inserted, { locations: 1, requests: 0, users: 0 });
  assert.equal((await t.repo.listLocations())[0].type, "campus");
});

test("seedIfEmpty still reports whether anything was inserted", async () => {
  assert.deepEqual(await seedIfEmpty(t.repo, { demo: true }), { seeded: true });
  assert.deepEqual(await seedIfEmpty(t.repo, { demo: true }), { seeded: false });
});

test("npm run seed works against the configured database and is safe to repeat", async () => {
  const run = () => runScript(t, "seed");
  const first = await run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /users: 3 inserted/);
  const second = await run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /locations: 0 inserted/);
});
