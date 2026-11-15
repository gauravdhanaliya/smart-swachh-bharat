// Data migrations run from a one-time script (npm run migrate), never on
// connect: on Vercel several instances can cold-start at once, and a migration
// must not run concurrently from each of them.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { connectDatabase } from "../src/db.js";
import { idToken, runScript, startTestServer } from "./helpers.js";

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.stop());

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
  const conn = await connectDatabase({ uri: t.config.mongoUri, dbName: "ecosetu_test" });
  await conn.close();
  assert.equal(await snapshot(), before);
  assert.equal((await t.db.collection("users").findOne({ uid: "old-1" })).phone, "9000088801");
});

test("npm run migrate converts old data, logs what it changed, and a second run changes nothing", async () => {
  const first = await migrate();
  assert.match(first, /users: \d+ changes removing phone numbers/);
  assert.match(first, /facility request owners: 1 re-keyed/);
  assert.match(first, /pending roles: 1 granted to a phone number removed \(grant them again by email\)/);
  assert.match(first, /old phone indexes: 1 dropped/);
  assert.match(first, /bins: 1 converted/);
  assert.ok(!/9000088\d{3}/.test(first), "no phone number in the log");

  const users = t.db.collection("users");
  const a = await users.findOne({ uid: "old-1" });
  for (const field of ["phone", "phoneHash", "phoneMasked"]) assert.equal(a[field], undefined, field);
  assert.equal(a.authProvider, "phone");
  assert.equal(a.role, "worker");
  assert.equal((await t.db.collection("facility_requests").findOne({ _id: "FR-2026-801" })).requestedByUser, "old-1");
  assert.equal(await t.db.collection("pending_roles").countDocuments(), 0, "a phone-keyed pending role can't become an email one");
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
  assert.equal(await t.db.collection("users").countDocuments({ phoneHash: { $exists: true } }), 0);
  assert.equal(await t.db.collection("pending_roles").countDocuments(), 0);
  assert.match(await migrate(), /Nothing to change/);
});

test("a user who signs in before the migration has run is not locked out", async () => {
  // Their device still holds the old phone sign-in (a "phone" Firebase token).
  const res = await fetch(`${t.base}/api/auth/firebase-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await idToken({ uid: "old-1", provider: "phone" }) }),
  });
  assert.equal(res.status, 200);
  const doc = await t.db.collection("users").findOne({ uid: "old-1" });
  assert.equal(doc.phone, undefined, "the plain number is removed at sign-in");
  assert.equal(doc.role, "worker", "the stored role is kept");
});

test("npm run migrate removes the accounts 'Continue without account' made, keeping their complaints anonymised", async () => {
  const bypass = { bypassDocumentValidation: true };
  const users = t.db.collection("users");
  const anon = { role: "citizen", name: "citizen", workerId: null, isDemo: false, authProvider: "anonymous", emailHash: null, emailMasked: null, emailVerified: false, createdAt: ts, updatedAt: ts };
  await users.insertMany([{ uid: "anon-old-1", ...anon }, { uid: "anon-old-2", ...anon }], bypass);
  // A saved one (linked to an email) is a "password" account: kept.
  await users.insertOne({ uid: "anon-saved", ...anon, authProvider: "password", emailHash: "b".repeat(64), emailMasked: "sa***@e***.test", emailVerified: true }, bypass);
  await t.db.collection("complaints").insertOne(
    {
      _id: "SSB2026-9901", citizenId: "anon-old-1", citizenName: "citizen", issueType: "Overflowing Bin", description: "left by an anonymous account",
      location: { address: "x", latitude: 29.89, longitude: 77.96 }, priority: "HIGH", status: "SUBMITTED", isDemo: false, createdAt: ts, updatedAt: ts,
    },
    bypass
  );

  const first = await migrate();
  assert.match(first, /anonymous accounts: 2 removed \(their complaints kept, anonymised\)/);
  assert.equal(await users.countDocuments({ authProvider: "anonymous" }), 0);
  assert.ok(await users.findOne({ uid: "anon-saved" }), "a saved account is kept");
  const kept = await t.db.collection("complaints").findOne({ _id: "SSB2026-9901" });
  assert.ok(kept, "the complaint stays on file");
  assert.equal(kept.citizenId, null);
  assert.notEqual(kept.citizenName, "citizen");
  assert.doesNotMatch(await migrate(), /anonymous accounts/);
});
