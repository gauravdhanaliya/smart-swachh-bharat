import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { seedIfEmpty } from "../src/seed.js";
import { parseCsv, importRows } from "../scripts/import-locations.js";
import { startTestServer } from "./helpers.js";

const CSV = `name,type,latitude,longitude,address,description,source_url
"Central Library, Block 2",library,29.8907,77.9603,COER University,"Reading hall",https://www.openstreetmap.org/way/1
Main Gate,main_gate,29.8884,77.9589,NH334,,
`;

let t;
let repo;

before(async () => {
  t = await startTestServer();
  repo = t.repo;
});
after(() => t.stop());

// Every test starts from the freshly seeded campus + demo data.
beforeEach(async () => {
  await t.db.collection("locations").deleteMany({});
  await t.db.collection("facility_requests").deleteMany({});
  await t.db.collection("counters").deleteMany({});
  await seedIfEmpty(repo, { demo: true });
});

test("parses quoted CSV fields", () => {
  const rows = parseCsv(CSV);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Central Library, Block 2");
});

test("imports valid rows as verified, non-demo locations", async () => {
  const res = await importRows(repo, parseCsv(CSV));
  assert.equal(res.imported, 2);
  const lib = (await repo.listLocations()).find((l) => l.name === "Central Library, Block 2");
  assert.equal(lib.source, "verified");
  assert.equal(lib.isDemo, false);
  assert.match(lib.description, /Source: https:\/\/www\.openstreetmap\.org/);
});

test("rejects the whole file when any row is invalid", async () => {
  const before = (await repo.listLocations()).length;
  const bad = CSV + "Broken,library,95,77.9,x,,\n";
  const res = await importRows(repo, parseCsv(bad));
  assert.equal(res.imported, 0);
  assert.match(res.problems[0], /Row 4/);
  assert.equal((await repo.listLocations()).length, before);
});

test("--replace-demo hides the simulated placeholders only", async () => {
  await importRows(repo, parseCsv(CSV), { replaceDemo: true });
  const left = await repo.listLocations();
  assert.ok(left.every((l) => !l.isDemo));
  assert.ok(left.some((l) => l.type === "campus"));
  assert.equal(left.length, 3); // campus + 2 imported
});

test("seeding twice does not duplicate anything", async () => {
  const before = (await repo.listLocations()).length;
  assert.deepEqual(await seedIfEmpty(repo, { demo: true }), { seeded: false });
  assert.equal((await repo.listLocations()).length, before);
});

test("generated ids continue after existing ones and never collide", async () => {
  const a = await repo.createLocation(
    { name: "Bin A", type: "dustbin", latitude: 29.89, longitude: 77.96, description: "", address: "", status: "normal", details: {} },
    "tester"
  );
  const b = await repo.createLocation(
    { name: "Bin B", type: "dustbin", latitude: 29.89, longitude: 77.96, description: "", address: "", status: "normal", details: {} },
    "tester"
  );
  assert.match(a.id, /^DB-\d{3}$/);
  assert.notEqual(a.id, b.id);
});
