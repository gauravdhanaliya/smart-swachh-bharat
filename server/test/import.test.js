import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, createRepository } from "../src/db.js";
import { seedIfEmpty } from "../src/seed.js";
import { parseCsv, importRows } from "../scripts/import-locations.js";

const CSV = `name,type,latitude,longitude,address,description,source_url
"Central Library, Block 2",library,29.8907,77.9603,COER University,"Reading hall",https://www.openstreetmap.org/way/1
Main Gate,main_gate,29.8884,77.9589,NH334,,
`;

function freshRepo() {
  const repo = createRepository(openDatabase(":memory:"));
  seedIfEmpty(repo, { demo: true });
  return repo;
}

test("parses quoted CSV fields", () => {
  const rows = parseCsv(CSV);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Central Library, Block 2");
});

test("imports valid rows as verified, non-demo locations", () => {
  const repo = freshRepo();
  const res = importRows(repo, parseCsv(CSV));
  assert.equal(res.imported, 2);
  const lib = repo.listLocations().find((l) => l.name === "Central Library, Block 2");
  assert.equal(lib.source, "verified");
  assert.equal(lib.isDemo, false);
  assert.match(lib.description, /Source: https:\/\/www\.openstreetmap\.org/);
});

test("rejects the whole file when any row is invalid", () => {
  const repo = freshRepo();
  const before = repo.listLocations().length;
  const bad = CSV + "Broken,library,95,77.9,x,,\n";
  const res = importRows(repo, parseCsv(bad));
  assert.equal(res.imported, 0);
  assert.match(res.problems[0], /Row 4/);
  assert.equal(repo.listLocations().length, before);
});

test("--replace-demo hides the simulated placeholders only", () => {
  const repo = freshRepo();
  importRows(repo, parseCsv(CSV), { replaceDemo: true });
  const left = repo.listLocations();
  assert.ok(left.every((l) => !l.isDemo));
  assert.ok(left.some((l) => l.type === "campus"));
  assert.equal(left.length, 3); // campus + 2 imported
});
