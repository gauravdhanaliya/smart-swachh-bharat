import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { startTestServer, TEST_ENV } from "./helpers.js";

let t;
let dir;
let file;

// A small SQLite file in the shape of the old server database.
function buildLegacyDb(target) {
  const db = new DatabaseSync(target);
  db.exec(`
    CREATE TABLE locations (id TEXT PRIMARY KEY, name TEXT, type TEXT, latitude REAL, longitude REAL,
      description TEXT, address TEXT, status TEXT, details TEXT, source TEXT, request_id TEXT,
      created_by TEXT, created_at TEXT, updated_at TEXT, is_demo INTEGER, deleted_at TEXT, deleted_by TEXT, delete_reason TEXT);
    CREATE TABLE facility_requests (id TEXT PRIMARY KEY, facility_type TEXT, suggested_name TEXT, address TEXT,
      latitude REAL, longitude REAL, reason TEXT, description TEXT, priority TEXT, photo TEXT, status TEXT,
      rejection_reason TEXT, requested_by_user TEXT, requested_by_worker_id TEXT, requested_by_worker_name TEXT,
      reviewed_by TEXT, is_demo INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE users (uid TEXT PRIMARY KEY, phone TEXT, role TEXT, name TEXT, worker_id TEXT, updated_at TEXT);
  `);
  const ts = "2026-01-01T00:00:00.000Z";
  db.prepare("INSERT INTO locations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    "DB-007", "Old Bin", "dustbin", 29.89, 77.96, "d", "a", "normal", '{"wasteType":"Dry Waste","fillLevel":10}',
    "government", null, "official:9000000001", ts, ts, 0, null, null, null
  );
  db.prepare("INSERT INTO locations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    "PT-002", "Gone Toilet", "public_toilet", 29.8, 77.9, "d", "a", "Open", "{}",
    "government", null, "official:9000000001", ts, ts, 0, ts, "official:9000000001", "closed down"
  );
  db.prepare("INSERT INTO facility_requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    "FR-2026-009", "Dustbin", "Bin by gate", "Gate road", 29.88, 77.95, "Waste piles up", "", "HIGH", null,
    "PENDING", "", "worker:9000000002", "w1", "Vikash", null, 0, ts, ts
  );
  db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run("uid-1", "9000000003", "worker", "Asha", "w2", ts);
  db.close();
}

before(async () => {
  t = await startTestServer();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssb-migrate-"));
  file = path.join(dir, "legacy.db");
  buildLegacyDb(file);
});

after(async () => {
  await t.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

const run = (...args) =>
  execFileSync(process.execPath, ["server/scripts/migrate-sqlite-to-mongo.js", file, ...args], {
    env: { ...process.env, ...TEST_ENV, MONGODB_URI: t.config.mongoUri, MONGODB_DB_NAME: "ecosetu_test" },
    encoding: "utf8",
  });

test("copies SQLite data into MongoDB, keeping the API shape, and is safe to rerun", async () => {
  assert.match(run("--dry-run"), /dry run/);
  assert.equal(await t.db.collection("locations").countDocuments(), 0, "a dry run writes nothing");

  const first = run();
  assert.match(first, /locations: 2 copied, 0 already there/);

  assert.deepEqual((await t.repo.listLocations()).map((l) => [l.id, l.name, l.details.fillLevel]), [["DB-007", "Old Bin", 10]]);
  assert.equal((await t.repo.listRemoved())[0].removalReason, "closed down");
  const req = await t.repo.getRequest("FR-2026-009");
  assert.deepEqual(req.location, { address: "Gate road", latitude: 29.88, longitude: 77.95 });
  assert.equal(req.requestedByWorkerName, "Vikash");
  assert.deepEqual(await t.repo.getUserByUid("uid-1"), { uid: "uid-1", phone: "9000000003", role: "worker", name: "Asha", workerId: "w2" });

  // second run: nothing duplicated, nothing overwritten
  await t.repo.grantRole({ phone: "9000000003", role: "official" });
  const second = run();
  assert.match(second, /locations: 0 copied, 2 already there/);
  assert.equal(await t.db.collection("locations").countDocuments(), 2);
  assert.equal((await t.repo.getUserByUid("uid-1")).role, "official", "rerunning must not undo later changes");

  // ids generated afterwards continue past the migrated ones
  const bin = await t.repo.createLocation(
    { name: "New", type: "dustbin", latitude: 29.8, longitude: 77.9, description: "", address: "", status: "normal", details: {} },
    "tester"
  );
  assert.equal(bin.id, "DB-008");
});
