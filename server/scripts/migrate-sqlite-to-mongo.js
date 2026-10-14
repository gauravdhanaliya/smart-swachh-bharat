// One-off, re-runnable migration: copies the old SQLite database
// (server/data/ecosetu.db) into MongoDB.
//
//   node --env-file=.env server/scripts/migrate-sqlite-to-mongo.js [path/to/ecosetu.db] [--dry-run]
//
// Idempotent: every row is written with an upsert keyed by its id (users by
// Firebase uid), and fields are only set when the document is first created
// ($setOnInsert), so running it again — or after the app has already changed
// some of the data — never duplicates or overwrites anything. Rows that can't
// be copied (e.g. a phone number already used by another uid) are listed, not
// fatal.
//
// Reads SQLite through Node's built-in node:sqlite, so this script is the only
// thing in the project that still knows about SQLite.

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../src/config.js";
import { connectDatabase } from "../src/db.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const file = args.find((a) => !a.startsWith("--")) ?? "server/data/ecosetu.db";

const tableExists = (db, name) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

const location = (r) => ({
  _id: r.id,
  name: r.name,
  type: r.type,
  latitude: r.latitude,
  longitude: r.longitude,
  description: r.description,
  address: r.address,
  status: r.status,
  details: JSON.parse(r.details || "{}"),
  source: r.source,
  requestId: r.request_id ?? null,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  isDemo: Boolean(r.is_demo),
  deletedAt: r.deleted_at ?? null,
  deletedBy: r.deleted_by ?? null,
  deleteReason: r.delete_reason ?? null,
});

const request = (r) => ({
  _id: r.id,
  facilityType: r.facility_type,
  suggestedName: r.suggested_name,
  address: r.address,
  latitude: r.latitude,
  longitude: r.longitude,
  reason: r.reason,
  description: r.description,
  priority: r.priority,
  photo: r.photo ?? null,
  status: r.status,
  rejectionReason: r.rejection_reason,
  requestedByUser: r.requested_by_user,
  requestedByWorkerId: r.requested_by_worker_id,
  requestedByWorkerName: r.requested_by_worker_name,
  reviewedBy: r.reviewed_by ?? null,
  isDemo: Boolean(r.is_demo),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const user = (r) => ({
  uid: r.uid,
  phone: r.phone,
  role: r.role,
  name: r.name,
  workerId: r.worker_id ?? null,
  createdAt: r.updated_at,
  updatedAt: r.updated_at,
});

async function copy(collection, rows, toDoc, keyOf, label, problems) {
  let inserted = 0;
  let existing = 0;
  for (const row of rows) {
    const doc = toDoc(row);
    if (dryRun) {
      inserted += 1;
      continue;
    }
    try {
      const res = await collection.updateOne(keyOf(doc), { $setOnInsert: doc }, { upsert: true });
      if (res.upsertedCount) inserted += 1;
      else existing += 1;
    } catch (err) {
      problems.push(`${label} ${doc._id ?? doc.uid}: ${err.code === 11000 ? "duplicate key (skipped)" : err.name}`);
    }
  }
  console.log(`  ${label}: ${inserted} ${dryRun ? "would be copied" : "copied"}, ${existing} already there`);
}

// Generated ids continue after the highest migrated one.
async function syncCounters(db, collectionName, prefix) {
  const ids = await db
    .collection(collectionName)
    .find({ _id: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` } }, { projection: { _id: 1 } })
    .toArray();
  const max = ids
    .map((d) => parseInt(d._id.slice(prefix.length), 10))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), 0);
  if (max) await db.collection("counters").updateOne({ _id: prefix }, { $max: { seq: max } }, { upsert: true });
}

if (!fs.existsSync(file)) {
  console.error(`SQLite file not found: ${file}\nNothing to migrate.`);
  process.exit(1);
}

const config = loadConfig();
const sqlite = new DatabaseSync(file, { readOnly: true });
const conn = await connectDatabase({ uri: config.mongoUri, dbName: config.mongoDbName }).catch((err) => {
  console.error(err.message);
  process.exit(1);
});

try {
  console.log(`${dryRun ? "[dry run] " : ""}Migrating ${file} -> MongoDB database "${config.mongoDbName}"`);
  const problems = [];
  const { db } = conn;

  await copy(db.collection("locations"), sqlite.prepare("SELECT * FROM locations").all(), location, (d) => ({ _id: d._id }), "locations", problems);
  await copy(
    db.collection("facility_requests"),
    sqlite.prepare("SELECT * FROM facility_requests").all(),
    request,
    (d) => ({ _id: d._id }),
    "facility_requests",
    problems
  );
  if (tableExists(sqlite, "users")) {
    await copy(db.collection("users"), sqlite.prepare("SELECT * FROM users").all(), user, (d) => ({ uid: d.uid }), "users", problems);
  } else {
    console.log("  users: no users table in this SQLite file (nothing to copy)");
  }

  if (!dryRun) {
    await syncCounters(db, "locations", "DB-");
    await syncCounters(db, "locations", "PT-");
    await syncCounters(db, "locations", "BL-");
    await syncCounters(db, "locations", "CP-");
    await syncCounters(db, "facility_requests", "FR-2026-");
  }

  if (problems.length) {
    console.warn(`\n${problems.length} row(s) skipped:`);
    problems.forEach((p) => console.warn(`  ${p}`));
  }
  console.log("Done.");
} finally {
  sqlite.close();
  await conn.close();
}
