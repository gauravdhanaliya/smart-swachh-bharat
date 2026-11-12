// Data migrations run from a one-time script (npm run migrate), never on
// connect: on Vercel several instances can cold-start at once, and a migration
// must not run concurrently from each of them.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { connectDatabase } from "../src/db.js";
import { hashPhone } from "../src/phone.js";
import { idToken, runScript, startTestServer, TEST_ENV } from "./helpers.js";

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.stop());

const SECRET = TEST_ENV.PHONE_HASH_SECRET;
const ts = "2026-01-01T00:00:00.000Z";
const legacyBin = (id, extra) => ({
  _id: id, name: id, type: "dustbin", latitude: 29.89, longitude: 77.96, description: "", address: "",
  source: "government", requestId: null, createdBy: "t", createdAt: ts, updatedAt: ts, isDemo: false,
  deletedAt: null, deletedBy: null, deleteReason: null, ...extra,
});

// Old-build data, written the way an old build did (no validator back then).
async function writeLegacyData() {
  const bypass = { bypassDocumentValidation: true };
  for (const c of ["users", "pending_roles", "facility_requests", "locations"]) await t.db.collection(c).deleteMany({});
  await t.db.collection("users").insertMany(
    [
      { uid: "old-1", phone: "9000088801", role: "worker", name: "Asha", workerId: "w1", createdAt: ts, updatedAt: ts },
      { uid: "old-2", phone: "9000088802", role: "citizen", name: "citizen", workerId: null, updatedAt: ts },
    ],
    bypass
  );
  const users = t.db.collection("users");
  if (!(await users.indexes()).some((i) => i.name === "phone_unique")) {
    await users.createIndex({ phone: 1 }, { unique: true, name: "phone_unique", partialFilterExpression: { phone: { $type: "string" } } });
  }
  await t.db.collection("pending_roles").insertOne({ _id: "9000088803", role: "official", workerId: null, createdAt: ts, updatedAt: ts }, bypass);
  await t.db.collection("facility_requests").insertOne(
    {
      _id: "FR-2026-801", facilityType: "Dustbin", suggestedName: "Old", address: "x", latitude: 29.89, longitude: 77.96,
      reason: "legacy request", description: "", priority: "LOW", photo: null, status: "PENDING", rejectionReason: "",
      requestedByUser: "worker:9000088801", requestedByWorkerId: "w1", requestedByWorkerName: "Asha", reviewedBy: null,
      isDemo: false, createdAt: ts, updatedAt: ts,
    },
    bypass
  );
  await t.db.collection("locations").insertOne(legacyBin("DB-801", { details: { wasteType: "Dry Waste", fillLevel: 95 } }), bypass);
}

const snapshot = async () => {
  const out = {};
  for (const c of ["users", "pending_roles", "facility_requests", "locations"]) {
    out[c] = await t.db.collection(c).find({}, { projection: { lastLoginAt: 0 } }).sort({ _id: 1 }).toArray();
  }
  out.indexes = (await t.db.collection("users").indexes()).map((i) => i.name).sort();
  return JSON.stringify(out);
};

const migrate = async () => {
  const r = await runScript(t, "migrate");
  assert.equal(r.status, 0, r.out);
  return r.stdout;
};

beforeEach(writeLegacyData);

test("connecting no longer migrates anything", async () => {
  const before = await snapshot();
  const conn = await connectDatabase({ uri: t.config.mongoUri, dbName: "ecosetu_test", phoneHashSecret: SECRET });
  await conn.close();
  assert.equal(await snapshot(), before);
  assert.equal((await t.db.collection("users").findOne({ uid: "old-1" })).phone, "9000088801");
});

test("npm run migrate converts old data, logs what it changed, and a second run changes nothing", async () => {
  const first = await migrate();
  assert.match(first, /users: 2 converted/);
  assert.match(first, /facility request owners: 1 re-keyed/);
  assert.match(first, /pending roles: 1 re-keyed/);
  assert.match(first, /old phone index: dropped/);
  assert.match(first, /bins: 1 converted/);
  assert.ok(!/9000088\d{3}/.test(first), "no phone number in the log");

  const users = t.db.collection("users");
  const a = await users.findOne({ uid: "old-1" });
  assert.equal(a.phone, undefined);
  assert.equal(a.phoneHash, hashPhone("9000088801", SECRET));
  assert.equal(a.phoneMasked, "+91 90XXXXXX01");
  assert.equal((await t.db.collection("facility_requests").findOne({ _id: "FR-2026-801" })).requestedByUser, "old-1");
  assert.ok(await t.db.collection("pending_roles").findOne({ _id: hashPhone("9000088803", SECRET) }));
  assert.deepEqual((await t.db.collection("locations").findOne({ _id: "DB-801" })).details, { wasteType: "Dry Waste" });

  const afterFirst = await snapshot();
  const second = await migrate();
  assert.match(second, /Nothing to change/);
  assert.equal(await snapshot(), afterFirst, "the second run left every record exactly as it was");
});

test("two runs started at the same moment both succeed and agree on the result", async () => {
  const [a, b] = await Promise.all([runScript(t, "migrate"), runScript(t, "migrate")]);
  assert.equal(a.status, 0, a.out);
  assert.equal(b.status, 0, b.out);
  assert.equal(await t.db.collection("users").countDocuments({ phone: { $exists: true } }), 0);
  assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: "9000088803" }), 0);
  assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: hashPhone("9000088803", SECRET) }), 1);
  assert.match(await migrate(), /Nothing to change/);
});

test("a user who signs in before the migration has run is not locked out", async () => {
  const res = await fetch(`${t.base}/api/auth/firebase-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await idToken({ uid: "old-1", phone: "+919000088801" }) }),
  });
  assert.equal(res.status, 200);
  const doc = await t.db.collection("users").findOne({ uid: "old-1" });
  assert.equal(doc.phone, undefined, "the plain number is removed at sign-in");
  assert.equal(doc.role, "worker", "the stored role is kept");
});
