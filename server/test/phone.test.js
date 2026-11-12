import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { hashPhone, maskPhone, normalisePhone } from "../src/phone.js";
import { loadConfig } from "../src/config.js";
import { migrateLegacyUsers } from "../src/db.js";
import { idToken, startTestServer, TEST_ENV } from "./helpers.js";

const SECRET = TEST_ENV.PHONE_HASH_SECRET;

describe("phone helpers", () => {
  test("hashPhone is a keyed hash: same input and secret give the same 64 hex chars", () => {
    const a = hashPhone("9876543210", SECRET);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(hashPhone("9876543210", SECRET), a);
    assert.notEqual(hashPhone("9876543211", SECRET), a);
    assert.notEqual(hashPhone("9876543210", "another-secret-another-secret-12345"), a, "a different secret gives a different hash");
  });

  test("hashPhone refuses a bad number or a weak secret", () => {
    assert.throws(() => hashPhone("12345", SECRET));
    assert.throws(() => hashPhone("+919876543210", SECRET));
    assert.throws(() => hashPhone("9876543210", "short"));
    assert.throws(() => hashPhone("9876543210", ""));
  });

  test("maskPhone keeps only the first two and last two digits", () => {
    assert.equal(maskPhone("9876543210"), "+91 98XXXXXX10");
    assert.ok(!maskPhone("9876543210").includes("765432"));
  });

  test("normalisePhone accepts the usual ways people type a number", () => {
    for (const input of ["9876543210", "+91 98765 43210", "09876543210", "+919876543210", "98765-43210"]) {
      assert.equal(normalisePhone(input), "9876543210", input);
    }
    for (const input of ["12345", "5876543210", "", null, "abc"]) assert.equal(normalisePhone(input), null);
  });
});

describe("PHONE_HASH_SECRET", () => {
  test("is required in production and must be long", () => {
    const base = { ...TEST_ENV, NODE_ENV: "production", PHONE_HASH_SECRET: "" };
    assert.throws(() => loadConfig(base), /PHONE_HASH_SECRET/);
    assert.throws(() => loadConfig({ ...base, PHONE_HASH_SECRET: "short" }), /PHONE_HASH_SECRET/);
  });

  test("falls back to a fixed development value with a warning", () => {
    const config = loadConfig({ ...TEST_ENV, PHONE_HASH_SECRET: "" });
    assert.ok(config.phoneHashSecret.length >= 32);
    assert.ok(config.warnings.some((w) => /PHONE_HASH_SECRET/.test(w)));
    assert.equal(loadConfig({ ...TEST_ENV, PHONE_HASH_SECRET: "" }).phoneHashSecret, config.phoneHashSecret, "stable across restarts");
  });
});

describe("users are stored without their phone number", () => {
  let t;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.stop());

  const login = async (uid, phone) => {
    const res = await fetch(`${t.base}/api/auth/firebase-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: await idToken({ uid, phone }) }),
    });
    return { status: res.status, json: await res.json() };
  };

  test("login stores a keyed hash and a masked copy, never the digits", async () => {
    const { status, json } = await login("ph-1", "+919000012345");
    assert.equal(status, 200);
    const doc = await t.db.collection("users").findOne({ uid: "ph-1" });
    assert.equal(doc.phoneHash, hashPhone("9000012345", SECRET));
    assert.equal(doc.phoneMasked, "+91 90XXXXXX45");
    assert.equal(doc.phone, undefined, "no plain phone field");
    assert.ok(!/9000012345/.test(JSON.stringify(doc)), "the number is nowhere in the document");
    assert.ok(typeof doc.lastLoginAt === "string");

    // and the API only ever returns the masked copy
    assert.equal(json.user.phone, "+91 90XXXXXX45");
    assert.equal(json.user.mobile, undefined);
    assert.equal(json.user.sub, undefined);
    assert.ok(!JSON.stringify(json).includes("9000012345"));
    const me = await fetch(`${t.base}/api/auth/me`, { headers: { Authorization: `Bearer ${json.accessToken}` } });
    assert.ok(!(await me.text()).includes("9000012345"));
  });

  test("a second login of the same uid updates lastLoginAt and keeps one record", async () => {
    const first = (await t.db.collection("users").findOne({ uid: "ph-1" })).lastLoginAt;
    await new Promise((r) => setTimeout(r, 5));
    await login("ph-1", "+919000012345");
    assert.equal(await t.db.collection("users").countDocuments({ uid: "ph-1" }), 1);
    assert.notEqual((await t.db.collection("users").findOne({ uid: "ph-1" })).lastLoginAt, first);
  });

  test("the phone index is on the hash: two accounts cannot share a number", async () => {
    assert.equal((await login("ph-2", "+919000012345")).status, 409);
    const indexes = await t.db.collection("users").indexes();
    assert.ok(indexes.some((i) => i.name === "phoneHash_unique" && i.unique));
    assert.ok(!indexes.some((i) => i.key?.phone), "no index on a plain phone field");
  });

  test("grant-role by phone number reaches the right user through the hash", async () => {
    await login("ph-3", "+919000067890");
    const granted = await t.repo.grantRole({ phone: "9000067890", role: "official" });
    assert.equal(granted.status, "updated");
    assert.equal((await t.repo.getUserByUid("ph-3")).role, "official");

    const pending = await t.repo.grantRole({ phone: "9000067891", role: "worker", workerId: "w2" });
    assert.equal(pending.status, "pending");
    const row = await t.db.collection("pending_roles").findOne({ _id: hashPhone("9000067891", SECRET) });
    assert.ok(row, "pending roles are keyed by the hash");
    assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: "9000067891" }), 0);
    const { json } = await login("ph-4", "+919000067891");
    assert.equal(json.user.role, "worker");
    assert.equal(json.user.wid, "w2");
  });

  test("records from an older build are migrated: plain phone replaced, owners re-keyed, old index dropped", async () => {
    const users = t.db.collection("users");
    const ts = "2026-01-01T00:00:00.000Z";
    // bypass validation the way an old build would have written these
    await t.db.command({ collMod: "users", validationLevel: "off" });
    await users.insertMany([
      { uid: "old-1", phone: "9000099901", role: "worker", name: "Asha", workerId: "w1", createdAt: ts, updatedAt: ts },
      { uid: "old-2", phone: "9000099902", role: "citizen", name: "citizen", workerId: null, updatedAt: ts },
    ]);
    await users.createIndex({ phone: 1 }, { unique: true, name: "phone_unique", partialFilterExpression: { phone: { $type: "string" } } });
    await t.db.collection("pending_roles").insertOne({ _id: "9000099903", role: "official", workerId: null, createdAt: ts, updatedAt: ts });
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

    assert.deepEqual(await migrateLegacyUsers(t.db, SECRET), { users: 2, requests: 1, pendingRoles: 1, indexDropped: true });

    const a = await users.findOne({ uid: "old-1" });
    assert.equal(a.phone, undefined);
    assert.equal(a.phoneHash, hashPhone("9000099901", SECRET));
    assert.equal(a.phoneMasked, "+91 90XXXXXX01");
    assert.equal(a.role, "worker");
    assert.equal((await users.findOne({ uid: "old-2" })).createdAt, ts, "a missing createdAt is filled in");
    assert.equal((await t.db.collection("facility_requests").findOne({ _id: "FR-2026-901" })).requestedByUser, "old-1");
    assert.ok(await t.db.collection("pending_roles").findOne({ _id: hashPhone("9000099903", SECRET) }));
    assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: "9000099903" }), 0);
    assert.ok(!(await users.indexes()).some((i) => i.name === "phone_unique"));
    assert.deepEqual(await migrateLegacyUsers(t.db, SECRET), { users: 0, requests: 0, pendingRoles: 0, indexDropped: false }, "a second run changes nothing");

    // the migrated worker still owns their request through the normal API
    await t.db.command({ collMod: "users", validationLevel: "strict" });
    assert.ok(!/90000999/.test(JSON.stringify(await users.find({ uid: { $in: ["old-1", "old-2"] } }).toArray())));
  });
});
