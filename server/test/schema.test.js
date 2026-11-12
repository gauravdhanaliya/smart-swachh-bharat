// Every collection has a JSON schema (required fields, enums, lengths) and the
// indexes the queries need. These tests write straight to the collections to
// prove the database itself refuses bad records, whatever the API does.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { COLLECTION_NAMES, ensureCollections } from "../src/schemas.js";
import { startTestServer } from "./helpers.js";

let t;
let db;
before(async () => {
  t = await startTestServer();
  db = t.db;
});
after(() => t.stop());

const ts = "2026-06-01T00:00:00.000Z";
const rejects = async (collection, doc) => {
  await assert.rejects(db.collection(collection).insertOne({ ...doc }), (err) => err.code === 121, `${collection} should reject ${JSON.stringify(doc).slice(0, 80)}`);
};
// Copies, so the driver adding _id to the inserted object never leaks into the next test.
const accepts = (collection, doc) => db.collection(collection).insertOne({ ...doc });

test("every collection exists with a validator, and setting them up twice is harmless", async () => {
  const before = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of COLLECTION_NAMES) assert.ok(before.includes(name), `missing collection ${name}`);
  await ensureCollections(db);
  const info = await db.listCollections({ name: "complaints" }).toArray();
  assert.equal(info[0].options.validationLevel, "strict");
  assert.equal(info[0].options.validationAction, "error");
  assert.ok(info[0].options.validator.$jsonSchema);
});

describe("users", () => {
  const user = { uid: "s-user", phoneHash: "a".repeat(64), phoneMasked: "+91 98XXXXXX10", role: "citizen", name: "A", workerId: null, isDemo: false, createdAt: ts, updatedAt: ts, lastLoginAt: ts };
  test("valid record is accepted; missing role, unknown role, plain phone, bad hash or mask are rejected", async () => {
    await accepts("users", user);
    await rejects("users", { ...user, uid: "s-2", role: undefined });
    await rejects("users", { ...user, uid: "s-3", role: "emperor" });
    await rejects("users", { ...user, uid: "s-4", phone: "9876543210" });
    await rejects("users", { ...user, uid: "s-5", phoneHash: "not-hex" });
    await rejects("users", { ...user, uid: "s-6", phoneMasked: "+91 9876543210" });
    await rejects("users", { ...user, uid: "s-7", name: "x".repeat(81) });
  });
  test("demo users have no phone at all, and several of them may coexist", async () => {
    await accepts("users", { ...user, uid: "s-demo-1", phoneHash: null, phoneMasked: null, isDemo: true });
    await accepts("users", { ...user, uid: "s-demo-2", phoneHash: null, phoneMasked: null, isDemo: true });
  });
});

describe("locations", () => {
  const loc = { _id: "DB-900", name: "Bin", type: "dustbin", latitude: 29.89, longitude: 77.96, description: "", address: "", status: "normal", statusSource: "simulated", details: { wasteType: "Dry Waste" }, source: "government", requestId: null, createdBy: "t", createdAt: ts, updatedAt: ts, isDemo: false, deletedAt: null, deletedBy: null, deleteReason: null };
  test("statuses, types, coordinates and sources are checked", async () => {
    await accepts("locations", loc);
    await rejects("locations", { ...loc, _id: "DB-901", status: "half" });
    await rejects("locations", { ...loc, _id: "DB-902", type: "bakery" });
    await rejects("locations", { ...loc, _id: "DB-903", latitude: 91 });
    await rejects("locations", { ...loc, _id: "DB-904", source: "hearsay" });
    await rejects("locations", { ...loc, _id: "DB-905", statusSource: "guess" });
    await rejects("locations", { ...loc, _id: "DB-906", fillLevel: 50 });
  });
});

describe("complaints", () => {
  const complaint = { _id: "SSB2026-0900", citizenId: "u1", citizenName: "Rahul", issueType: "Overflowing Bin", category: null, description: "Bin is overflowing", location: { address: "COER", latitude: 29.89, longitude: 77.96 }, facilityType: "bin", facilityId: "DB-001", priority: "HIGH", photo: null, status: "SUBMITTED", assignedWorkerId: null, assignedWorkerName: null, resolutionNote: "", resolutionPhoto: null, openKey: null, isDemo: false, createdAt: ts, updatedAt: ts };
  test("owner, status, priority, facility type and lengths are checked", async () => {
    await accepts("complaints", complaint);
    const { citizenId: _omit, ...withoutOwner } = complaint;
    await rejects("complaints", { ...withoutOwner, _id: "SSB2026-0901" }); // the owner field must be there (null only once anonymised)
    await rejects("complaints", { ...complaint, _id: "SSB2026-0902", status: "DONE" });
    await rejects("complaints", { ...complaint, _id: "SSB2026-0903", priority: "URGENT" });
    await rejects("complaints", { ...complaint, _id: "SSB2026-0904", facilityType: "park" });
    await rejects("complaints", { ...complaint, _id: "SSB2026-0905", description: "x".repeat(501) });
    await rejects("complaints", { ...complaint, _id: "SSB2026-0906", resolutionNote: "x".repeat(301) });
    await rejects("complaints", { ...complaint, _id: "bad-id" });
    await rejects("complaints", { ...complaint, _id: "SSB2026-0907", votes: { u2: "up" } });
    await accepts("complaints", { ...complaint, _id: "SSB2026-0908", citizenId: null, citizenName: "Deleted user" });
  });
  test("has the indexes the citizen, worker and facility views need", async () => {
    const keys = (await db.collection("complaints").indexes()).map((i) => JSON.stringify(i.key));
    assert.ok(keys.includes(JSON.stringify({ citizenId: 1, status: 1 })));
    assert.ok(keys.includes(JSON.stringify({ facilityId: 1 })));
    assert.ok(keys.includes(JSON.stringify({ assignedWorkerId: 1, status: 1 })));
  });
});

describe("toilet_ratings", () => {
  const rating = { toiletId: "PT-001", userId: "u1", stars: 4, categories: { cleanliness: 4, water: 5 }, comment: "", createdAt: ts, updatedAt: ts };
  test("stars are whole numbers 1 to 5, categories too, comment at most 300 characters", async () => {
    await accepts("toilet_ratings", rating);
    await rejects("toilet_ratings", { ...rating, userId: "u2", stars: 0 });
    await rejects("toilet_ratings", { ...rating, userId: "u3", stars: 6 });
    await rejects("toilet_ratings", { ...rating, userId: "u4", stars: 3.5 });
    await rejects("toilet_ratings", { ...rating, userId: "u5", categories: { cleanliness: 9 } });
    await rejects("toilet_ratings", { ...rating, userId: "u6", categories: { smell: 3 } });
    await rejects("toilet_ratings", { ...rating, userId: "u7", comment: "x".repeat(301) });
    await rejects("toilet_ratings", { ...rating, userId: "u8", toiletId: undefined });
  });
  test("one rating per user per toilet is enforced by a unique index", async () => {
    await assert.rejects(accepts("toilet_ratings", { ...rating, stars: 2 }), (err) => err.code === 11000);
    await accepts("toilet_ratings", { ...rating, toiletId: "PT-002" });
  });
});

describe("notifications, consents, refresh tokens, rate limits", () => {
  test("notifications need an owner, a kind and a message", async () => {
    await accepts("notifications", { userId: "u1", kind: "complaint", message: "Hello", detail: "", complaintId: "SSB2026-0001", requestId: null, readAt: null, createdAt: ts });
    await rejects("notifications", { kind: "complaint", message: "no owner", createdAt: ts });
    await rejects("notifications", { userId: "u1", kind: "gossip", message: "x", createdAt: ts });
    await rejects("notifications", { userId: "u1", kind: "complaint", message: "x".repeat(201), createdAt: ts });
    const keys = (await db.collection("notifications").indexes()).map((i) => JSON.stringify(i.key));
    assert.ok(keys.includes(JSON.stringify({ userId: 1, createdAt: -1, _id: -1 })));
  });

  test("consents are keyed by user with a version and the four checkboxes", async () => {
    const items = { phoneForLogin: true, locationWhenReporting: true, photosAttached: true, readNotice: true };
    await accepts("consents", { _id: "u1", version: 1, acceptedAt: ts, items, updatedAt: ts });
    await rejects("consents", { _id: "u2", version: 0, acceptedAt: ts, items, updatedAt: ts });
    await rejects("consents", { _id: "u3", version: 1, acceptedAt: ts, items: { ...items, marketing: true }, updatedAt: ts });
    await rejects("consents", { _id: "u4", version: 1, acceptedAt: ts, items: { ...items, readNotice: "yes" }, updatedAt: ts });
  });

  test("refresh tokens hold a hash, never the token, and expire", async () => {
    const now = new Date();
    await accepts("refresh_tokens", { uid: "u1", tokenHash: "b".repeat(64), expiresAt: now, createdAt: now, revokedAt: null });
    await rejects("refresh_tokens", { uid: "u1", tokenHash: "eyJhbGciOi.raw.jwt", expiresAt: now, createdAt: now, revokedAt: null });
    await rejects("refresh_tokens", { uid: "u1", tokenHash: "c".repeat(64), expiresAt: "2026-01-01", createdAt: now, revokedAt: null });
    const ttl = (await db.collection("refresh_tokens").indexes()).find((i) => i.key.expiresAt);
    assert.equal(ttl.expireAfterSeconds, 0);
  });

  test("auth rate-limit counters expire on their own", async () => {
    const now = new Date();
    await accepts("auth_rate_limits", { _id: "auth:1.2.3.4", count: 1, windowStart: now, expiresAt: now });
    await rejects("auth_rate_limits", { _id: "auth:1.2.3.5", count: "one", windowStart: now, expiresAt: now });
    const ttl = (await db.collection("auth_rate_limits").indexes()).find((i) => i.key.expiresAt);
    assert.equal(ttl?.expireAfterSeconds, 0);
  });

  test("ObjectId primary keys are fine where no readable id is needed", async () => {
    await accepts("toilet_ratings", { _id: new ObjectId(), toiletId: "PT-009", userId: "u9", stars: 5, categories: {}, comment: "", createdAt: ts, updatedAt: ts });
  });
});
