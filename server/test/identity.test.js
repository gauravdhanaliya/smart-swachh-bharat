// What identifies an account now that nobody signs in with a phone number:
// a keyed hash + masked copy of a saved account's email (identity.js), the
// secret that keys it (PHONE_HASH_SECRET, name kept), and the migration
// that removes every phone number and phone hash from existing users.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { hashEmail, maskEmail, normaliseEmail } from "../src/identity.js";
import { loadConfig } from "../src/config.js";
import { migrateLegacyUsers } from "../src/db.js";
import { idToken, startTestServer, TEST_ENV } from "./helpers.js";

const SECRET = TEST_ENV.PHONE_HASH_SECRET;

describe("email helpers", () => {
  test("hashEmail is a keyed hash of the lowercased, trimmed address", () => {
    const a = hashEmail("Asha@Example.test", SECRET);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(hashEmail("  asha@example.TEST ", SECRET), a);
    assert.notEqual(hashEmail("asha2@example.test", SECRET), a);
    assert.notEqual(hashEmail("asha@example.test", "another-secret-another-secret-12345"), a, "a different secret gives a different hash");
  });

  test("hashEmail refuses a non-address or a weak secret", () => {
    for (const bad of ["", "asha", "@example.test", "asha@", "a b@example.test"]) assert.throws(() => hashEmail(bad, SECRET), bad);
    assert.throws(() => hashEmail("asha@example.test", "short"));
  });

  test("maskEmail keeps the first letters and the ending only", () => {
    assert.equal(maskEmail("asha.verma@example.test"), "as***@e***.test");
    assert.equal(maskEmail("a@b.co"), "a***@b***.co");
    assert.equal(maskEmail("not an email"), null);
    assert.ok(!maskEmail("asha.verma@example.test").includes("verma"));
  });

  test("normaliseEmail lowercases and trims, or says null", () => {
    assert.equal(normaliseEmail(" Asha@Example.TEST "), "asha@example.test");
    for (const bad of [null, undefined, 42, "nope", "x@y"]) assert.equal(normaliseEmail(bad), null, String(bad));
  });
});

describe("PHONE_HASH_SECRET (keys the email hash; the name is kept)", () => {
  test("is required in production and must be long", () => {
    const base = { ...TEST_ENV, NODE_ENV: "production", PHONE_HASH_SECRET: "" };
    assert.throws(() => loadConfig(base), /PHONE_HASH_SECRET/);
    assert.throws(() => loadConfig({ ...base, PHONE_HASH_SECRET: "short" }), /PHONE_HASH_SECRET/);
  });

  test("falls back to a fixed development value with a warning", () => {
    const config = loadConfig({ ...TEST_ENV, PHONE_HASH_SECRET: "" });
    assert.ok(config.identityHashSecret.length >= 32);
    assert.ok(config.warnings.some((w) => /PHONE_HASH_SECRET/.test(w)));
    assert.equal(loadConfig({ ...TEST_ENV, PHONE_HASH_SECRET: "" }).identityHashSecret, config.identityHashSecret, "stable across restarts");
  });
});

describe("migration: no phone numbers left", () => {
  let t;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.stop());

  test("every kind of old record is converted, nothing phone-shaped remains, and the accounts keep working", async () => {
    const users = t.db.collection("users");
    const ts = "2026-01-01T00:00:00.000Z";
    const hex = (c) => c.repeat(64);
    // bypass validation the way an old build would have written these
    await t.db.command({ collMod: "users", validationLevel: "off" });
    await users.insertMany([
      // the oldest builds: a plain number
      { uid: "old-1", phone: "9000099901", role: "worker", name: "Asha", workerId: "w1", createdAt: ts, updatedAt: ts },
      { uid: "old-2", phone: "9000099902", role: "citizen", name: "citizen", workerId: null, updatedAt: ts },
      // the last phone build: a keyed hash and a masked copy
      { uid: "hashed-1", phoneHash: hex("a"), phoneMasked: "+91 90XXXXXX03", role: "official", name: "Officer", workerId: null, isDemo: false, createdAt: ts, updatedAt: ts },
      // a seeded demo account from that build
      { uid: "demo-x", phoneHash: null, phoneMasked: null, role: "citizen", name: "Demo", workerId: null, isDemo: true, createdAt: ts, updatedAt: ts },
    ]);
    await users.createIndex({ phone: 1 }, { unique: true, name: "phone_unique", partialFilterExpression: { phone: { $type: "string" } } });
    await users.createIndex({ phoneHash: 1 }, { unique: true, name: "phoneHash_unique", partialFilterExpression: { phoneHash: { $type: "string" } } });
    await t.db.collection("pending_roles").insertMany([
      { _id: "9000099905", role: "official", workerId: null, createdAt: ts, updatedAt: ts }, // by number
      { _id: hex("b"), role: "worker", workerId: "w2", createdAt: ts, updatedAt: ts }, // by phone hash
    ]);
    await t.repo.grantRole({ email: "kept@example.test", role: "worker" }); // granted by email: stays
    await t.db.command({ collMod: "consents", validationLevel: "off" });
    await t.db.collection("consents").insertOne({ _id: "hashed-1", version: 1, acceptedAt: ts, items: { phoneForLogin: true, locationWhenReporting: true, photosAttached: true, readNotice: true } });
    await t.repo.insertRequest({
      id: "FR-2026-901",
      facilityType: "Dustbin",
      suggestedName: "Legacy owner",
      address: "x",
      latitude: 29.89,
      longitude: 77.96,
      reason: "legacy request",
      priority: "LOW",
      requestedByUser: "worker:9000099901",
      requestedByWorkerId: "w1",
      requestedByWorkerName: "Asha",
    });

    const first = await migrateLegacyUsers(t.db);
    assert.equal(first.requests, 1);
    assert.equal(first.pendingRoles, 2, "both phone-keyed pending roles");
    assert.equal(first.consents, 1);
    assert.equal(first.indexesDropped, 2);
    assert.ok(first.users >= 4);

    const all = await users.find({ uid: { $in: ["old-1", "old-2", "hashed-1", "demo-x"] } }).toArray();
    for (const doc of all) {
      for (const field of ["phone", "phoneHash", "phoneMasked"]) assert.equal(doc[field], undefined, `${doc.uid}.${field}`);
      assert.equal(doc.emailHash, null);
      assert.equal(doc.emailVerified, false);
    }
    const byUid = Object.fromEntries(all.map((d) => [d.uid, d]));
    assert.equal(byUid["old-1"].authProvider, "phone");
    assert.equal(byUid["old-1"].role, "worker", "roles are kept");
    assert.equal(byUid["hashed-1"].authProvider, "phone");
    assert.equal(byUid["hashed-1"].role, "official");
    assert.equal(byUid["demo-x"].authProvider, "demo");
    assert.equal(byUid["old-2"].createdAt, ts, "a missing createdAt is filled in");
    assert.ok(!/9000099|XXXXXX/.test(JSON.stringify(all)), "no number, no masked number");
    assert.equal((await t.db.collection("facility_requests").findOne({ _id: "FR-2026-901" })).requestedByUser, "old-1");
    assert.deepEqual((await t.db.collection("pending_roles").find({}).toArray()).map((p) => p.kind), ["email"], "only the email grant is left");
    assert.equal((await t.db.collection("consents").findOne({ _id: "hashed-1" })).items.phoneForLogin, undefined);
    assert.ok(!(await users.indexes()).some((i) => i.key.phone || i.key.phoneHash));

    assert.deepEqual(await migrateLegacyUsers(t.db), { users: 0, requests: 0, pendingRoles: 0, consents: 0, indexesDropped: 0 }, "a second run changes nothing");

    // With validation back on, the migrated accounts still sign in (the old phone sign-in's tokens).
    await t.db.command({ collMod: "users", validationLevel: "strict" });
    await t.db.command({ collMod: "consents", validationLevel: "strict" });
    for (const uid of ["old-1", "hashed-1"]) {
      const res = await fetch(`${t.base}/api/auth/firebase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await idToken({ uid, provider: "phone" }) }),
      });
      assert.equal(res.status, 200, uid);
      assert.equal((await res.json()).user.account.type, "legacy");
    }
  });

  test("an old phone account that saves an email account becomes a normal saved account", async () => {
    await t.db.command({ collMod: "users", validationLevel: "off" });
    const ts = "2026-01-01T00:00:00.000Z";
    await t.db.collection("users").insertOne({ uid: "upgrade-1", phoneHash: "c".repeat(64), phoneMasked: "+91 90XXXXXX09", role: "worker", name: "W", workerId: "w1", isDemo: false, createdAt: ts, updatedAt: ts });
    await t.db.command({ collMod: "users", validationLevel: "strict" });
    // Before the migration ran: linking still works and drops the phone fields.
    const res = await fetch(`${t.base}/api/auth/firebase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: await idToken({ uid: "upgrade-1", provider: "password", email: "upgrade@example.test" }) }),
    });
    assert.equal(res.status, 200);
    const doc = await t.db.collection("users").findOne({ uid: "upgrade-1" });
    assert.equal(doc.authProvider, "password");
    assert.equal(doc.role, "worker", "keeps the role it had");
    assert.equal(doc.phoneHash, undefined);
    assert.equal(doc.phoneMasked, undefined);
  });
});
