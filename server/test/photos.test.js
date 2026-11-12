// Photos live in a PRIVATE Vercel Blob store (mocked here). MongoDB holds only
// the blob pathname; photos are served only through the API, with the same
// ownership rules as the complaint or request they belong to.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedAll } from "../src/seed.js";
import { DEMO_BINS } from "../src/seed-data.js";
import { complaintListPipeline } from "../src/civic.js";
import { createMemoryPhotoStore } from "../src/photoStore.js";
import { apiClient, runScript, startTestServer } from "./helpers.js";

const jpeg = (bytes, fill = 7) => `data:image/jpeg;base64,${Buffer.alloc(bytes, fill).toString("base64")}`;
const png = (bytes) => `data:image/png;base64,${Buffer.alloc(bytes, 3).toString("base64")}`;
const GENERAL = { issueType: "Dirty Area", description: "Rubbish beside the road", location: { address: "Gate", latitude: 29.8886, longitude: 77.959 } };
const REQUEST = {
  facilityType: "Dustbin",
  suggestedName: "Bin by workshop",
  location: { address: "Workshop road", latitude: 29.8899, longitude: 77.96 },
  reason: "Waste piles up here daily",
  priority: "HIGH",
  requestedByWorkerId: "w1",
  requestedByWorkerName: "Vikash Kumar",
};

async function rawGet(t, urlPath, token) {
  const res = await fetch(t.base + urlPath, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, type: res.headers.get("content-type"), cache: res.headers.get("cache-control"), body: Buffer.from(await res.arrayBuffer()) };
}

let t;
let api;
let owner;
let other;
let w1;
let w2;
let official;

before(async () => {
  t = await startTestServer({ CRON_SECRET: "test-cron-secret-test-cron-secret" });
  await seedAll(t.repo, { demo: true });
  api = apiClient(t);
  owner = await api.signIn("ph-owner");
  other = await api.signIn("ph-other");
  w1 = await api.signIn("ph-w1", { role: "worker", workerId: "w1", name: "Vikash Kumar" });
  w2 = await api.signIn("ph-w2", { role: "worker", workerId: "w2", name: "Ramesh Kumar" });
  official = await api.signIn("ph-official", { role: "official" });
});
after(() => t.stop());

describe("complaint photos", () => {
  let id;
  let doc;

  test("an upload goes to the private store; MongoDB keeps only the pathname", async () => {
    const before = t.photos.count();
    const res = await api.call("POST", "/api/complaints", { token: owner.token, body: { ...GENERAL, photo: jpeg(5000) } });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    id = res.json.complaint.id;
    doc = await t.db.collection("complaints").findOne({ _id: id });
    assert.match(doc.photoPath, /^complaints\/[0-9a-f-]{36}\.jpg$/);
    assert.equal(doc.photo, undefined, "no base64 in the database");
    assert.equal(t.photos.count(), before + 1);
    assert.deepEqual(t.photos.read(doc.photoPath), { bytes: Buffer.alloc(5000, 7), contentType: "image/jpeg" });
    assert.equal(t.photos.lastPut.access, "private", "uploaded to a private store");

    const c = res.json.complaint;
    assert.equal(c.hasPhoto, true);
    assert.equal(c.photoUrl, `/api/complaints/${id}/photo`);
    assert.ok(!JSON.stringify(res.json).includes("base64"), "the response carries no image data");
    assert.ok(!JSON.stringify(res.json).includes(doc.photoPath), "nor the blob pathname");
  });

  test("the photo is served to the owner, the assigned worker and officials; everyone else gets 404", async () => {
    await api.call("POST", `/api/complaints/${id}/assign`, { token: official.token, body: { workerId: "w1" } });
    for (const who of [owner, w1, official]) {
      const res = await rawGet(t, `/api/complaints/${id}/photo`, who.token);
      assert.equal(res.status, 200);
      assert.equal(res.type, "image/jpeg");
      assert.match(res.cache, /private/);
      assert.match(res.cache, /no-store/);
      assert.deepEqual(res.body, Buffer.alloc(5000, 7));
    }
    const missing = await rawGet(t, "/api/complaints/SSB2026-9999/photo", official.token);
    for (const who of [other, w2]) {
      const res = await rawGet(t, `/api/complaints/${id}/photo`, who.token);
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, missing.body, "looks exactly like a complaint that doesn't exist");
    }
    assert.equal((await rawGet(t, `/api/complaints/${id}/photo`)).status, 401);
  });

  test("a complaint without a photo has none to serve", async () => {
    const c = (await api.call("POST", "/api/complaints", { token: owner.token, body: GENERAL })).json.complaint;
    assert.equal(c.hasPhoto, false);
    assert.equal(c.photoUrl, null);
    assert.equal((await rawGet(t, `/api/complaints/${c.id}/photo`, owner.token)).status, 404);
  });

  test("a resolution photo is stored the same way and follows the same rules", async () => {
    await api.call("PATCH", `/api/complaints/${id}/status`, { token: w1.token, body: { status: "IN_PROGRESS" } });
    const done = await api.call("PATCH", `/api/complaints/${id}/status`, {
      token: w1.token,
      body: { status: "RESOLVED", resolutionNote: "Cleared.", resolutionPhoto: png(800) },
    });
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.equal(done.json.complaint.resolutionPhotoUrl, `/api/complaints/${id}/resolution-photo`);
    const stored = await t.db.collection("complaints").findOne({ _id: id });
    assert.match(stored.resolutionPhotoPath, /^resolutions\/[0-9a-f-]{36}\.png$/);
    const res = await rawGet(t, `/api/complaints/${id}/resolution-photo`, owner.token);
    assert.equal(res.status, 200);
    assert.equal(res.type, "image/png");
    assert.equal((await rawGet(t, `/api/complaints/${id}/resolution-photo`, other.token)).status, 404);
  });

  test("bad photos are refused before anything is uploaded", async () => {
    const before = t.photos.count();
    for (const photo of [jpeg(1_000_001), "data:image/gif;base64,R0lGOD", "data:text/html;base64,PHA+", "https://example.com/x.jpg"]) {
      const res = await api.call("POST", "/api/complaints", { token: owner.token, body: { ...GENERAL, photo } });
      assert.equal(res.status, 400, photo.slice(0, 30));
    }
    assert.equal(t.photos.count(), before);
  });

  test("a report refused after the upload (duplicate) leaves no photo behind", async () => {
    const body = { facilityType: "bin", facilityId: DEMO_BINS[0].id, category: "Damaged", photo: jpeg(100) };
    assert.equal((await api.call("POST", "/api/complaints", { token: other.token, body })).status, 201);
    const before = t.photos.count();
    const dup = await api.call("POST", "/api/complaints", { token: other.token, body });
    assert.equal(dup.status, 409);
    assert.equal(t.photos.count(), before);
  });

  test("lists never carry photos or blob pathnames", async () => {
    const list = await api.listAll("/api/complaints", "items", owner.token);
    const item = list.find((c) => c.id === id);
    assert.equal(item.hasPhoto, true);
    assert.equal(item.photoUrl, `/api/complaints/${id}/photo`);
    assert.ok(!JSON.stringify(list).includes("base64"));
    assert.ok(!/complaints\/[0-9a-f-]{36}\.jpg/.test(JSON.stringify(list)), "no blob pathname");
  });
});

describe("the list query itself never reads photo fields", () => {
  const PHOTO_FIELDS = ["photo", "resolutionPhoto", "photoPath", "resolutionPhotoPath"];

  test("its final projection excludes every photo field", () => {
    const pipeline = complaintListPipeline({ citizenId: "x" }, { skip: 0, limit: 20 });
    const last = pipeline.at(-1);
    assert.ok(last.$project, "the pipeline ends with a projection");
    for (const field of PHOTO_FIELDS) assert.equal(last.$project[field], 0, `${field} is projected out`);
    assert.ok(!pipeline.slice(0, -1).some((stage) => stage.$project), "nothing re-adds them after");
  });

  test("run against MongoDB, it returns no photo data, only the flags", async () => {
    const docs = await t.db.collection("complaints").aggregate(complaintListPipeline({}, { skip: 0, limit: 100 })).toArray();
    assert.ok(docs.some((d) => d.hasPhoto));
    for (const d of docs) for (const field of PHOTO_FIELDS) assert.equal(d[field], undefined, field);
  });
});

describe("facility request photos", () => {
  test("stored privately and served only to the requesting worker and reviewers", async () => {
    const res = await api.call("POST", "/api/facility-requests", { token: w1.token, body: { ...REQUEST, photo: jpeg(300) } });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const id = res.json.request.id;
    assert.equal(res.json.request.photoUrl, `/api/facility-requests/${id}/photo`);
    const doc = await t.db.collection("facility_requests").findOne({ _id: id });
    assert.match(doc.photoPath, /^facility-requests\/[0-9a-f-]{36}\.jpg$/);
    assert.equal(doc.photo, undefined);
    assert.equal((await rawGet(t, `/api/facility-requests/${id}/photo`, w1.token)).status, 200);
    assert.equal((await rawGet(t, `/api/facility-requests/${id}/photo`, official.token)).status, 200);
    assert.equal((await rawGet(t, `/api/facility-requests/${id}/photo`, w2.token)).status, 404);
    assert.equal((await rawGet(t, `/api/facility-requests/${id}/photo`, owner.token)).status, 403, "citizens can't use request routes at all");
  });
});

describe("deleting", () => {
  test("deleting a complaint deletes its photos (officials only)", async () => {
    const c = (await api.call("POST", "/api/complaints", { token: owner.token, body: { ...GENERAL, photo: jpeg(50) } })).json.complaint;
    const { photoPath } = await t.db.collection("complaints").findOne({ _id: c.id });
    assert.equal((await api.call("DELETE", `/api/complaints/${c.id}`, { token: owner.token })).status, 403);
    assert.equal((await api.call("DELETE", `/api/complaints/${c.id}`, { token: w1.token })).status, 403);
    const res = await api.call("DELETE", `/api/complaints/${c.id}`, { token: official.token });
    assert.equal(res.status, 200);
    assert.equal(await t.db.collection("complaints").countDocuments({ _id: c.id }), 0);
    assert.equal(t.photos.has(photoPath), false);
    assert.equal((await api.call("DELETE", `/api/complaints/${c.id}`, { token: official.token })).status, 404);
  });

  test("delete my data deletes the photos the user attached, and keeps the complaint", async () => {
    const me = await api.signIn("ph-leaver");
    const c = (await api.call("POST", "/api/complaints", { token: me.token, body: { ...GENERAL, photo: jpeg(60) } })).json.complaint;
    const { photoPath } = await t.db.collection("complaints").findOne({ _id: c.id });
    const res = await api.call("DELETE", "/api/me/data", { token: me.token, body: { confirm: true } });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.deleted.photos, 1);
    assert.equal(t.photos.has(photoPath), false);
    const kept = await t.db.collection("complaints").findOne({ _id: c.id });
    assert.equal(kept.photoPath, null);
    assert.equal(kept.citizenName, "Deleted user");
  });

  test("a failed blob delete never fails the request: it is queued and retried later", async () => {
    const c = (await api.call("POST", "/api/complaints", { token: owner.token, body: { ...GENERAL, photo: jpeg(70) } })).json.complaint;
    const { photoPath } = await t.db.collection("complaints").findOne({ _id: c.id });
    t.photos.failDeletes = true;
    try {
      const res = await api.call("DELETE", `/api/complaints/${c.id}`, { token: official.token });
      assert.equal(res.status, 200, "the user's request still succeeds");
    } finally {
      t.photos.failDeletes = false;
    }
    assert.equal(t.photos.has(photoPath), true);
    const queued = await t.db.collection("blob_deletions").findOne({ _id: photoPath });
    assert.ok(queued, "queued for a retry");
    assert.equal(queued.attempts, 1);

    // the daily cron retries it, and only with the right secret
    assert.equal((await api.call("GET", "/api/cron/blob-deletions")).status, 401);
    assert.equal((await api.call("GET", "/api/cron/blob-deletions", { headers: { Authorization: "Bearer wrong" } })).status, 401);
    const run = await api.call("GET", "/api/cron/blob-deletions", { headers: { Authorization: "Bearer test-cron-secret-test-cron-secret" } });
    assert.equal(run.status, 200);
    assert.deepEqual(run.json, { deleted: 1, stillQueued: 0 });
    assert.equal(t.photos.has(photoPath), false);
    assert.equal(await t.db.collection("blob_deletions").countDocuments(), 0);
  });
});

describe("photo storage unavailable (e.g. Blob over its limit)", () => {
  const WARNING = "Photo could not be saved, your complaint was submitted without it.";

  for (const [label, store] of [
    ["no store configured", () => null],
    ["the store refusing uploads", () => Object.assign(createMemoryPhotoStore(), { failPuts: true })],
  ]) {
    test(`${label}: the complaint is still filed, without the photo, and the reply says so`, async () => {
      const t2 = await startTestServer({}, { photos: store() });
      try {
        await seedAll(t2.repo, { demo: true });
        const a = apiClient(t2);
        const c = await a.signIn(`down-${label.length}`);
        const res = await a.call("POST", "/api/complaints", { token: c.token, body: { ...GENERAL, photo: jpeg(10) } });
        assert.equal(res.status, 201, JSON.stringify(res.json));
        assert.equal(res.json.photoSaved, false);
        assert.equal(res.json.warning, WARNING);
        assert.equal(res.json.complaint.hasPhoto, false);
        const doc = await t2.db.collection("complaints").findOne({ _id: res.json.complaint.id });
        assert.equal(doc.photoPath, null);

        const plain = await a.call("POST", "/api/complaints", { token: c.token, body: { ...GENERAL, description: "No photo at all" } });
        assert.equal(plain.status, 201);
        assert.equal(plain.json.photoSaved, undefined, "no warning when there was no photo");
      } finally {
        await t2.stop();
      }
    });
  }

  test("a resolution or facility-request photo that can't be saved doesn't block the work either", async () => {
    const t2 = await startTestServer({}, { photos: Object.assign(createMemoryPhotoStore(), { failPuts: true }) });
    try {
      await seedAll(t2.repo, { demo: true });
      const a = apiClient(t2);
      const c = await a.signIn("down-res-c");
      const w = await a.signIn("down-res-w", { role: "worker", workerId: "w1" });
      const o = await a.signIn("down-res-o", { role: "official" });
      const id = (await a.call("POST", "/api/complaints", { token: c.token, body: GENERAL })).json.complaint.id;
      await a.call("POST", `/api/complaints/${id}/assign`, { token: o.token, body: { workerId: "w1" } });
      await a.call("PATCH", `/api/complaints/${id}/status`, { token: w.token, body: { status: "IN_PROGRESS" } });
      const done = await a.call("PATCH", `/api/complaints/${id}/status`, { token: w.token, body: { status: "RESOLVED", resolutionNote: "Cleared.", resolutionPhoto: jpeg(10) } });
      assert.equal(done.status, 200);
      assert.equal(done.json.photoSaved, false);
      assert.equal(done.json.complaint.status, "RESOLVED");
      const req = await a.call("POST", "/api/facility-requests", { token: w.token, body: { ...REQUEST, photo: jpeg(10) } });
      assert.equal(req.status, 201);
      assert.equal(req.json.photoSaved, false);
    } finally {
      await t2.stop();
    }
  });
});

describe("migrating base64 photos", () => {
  test("npm run migrate moves them to the store once; a second run changes nothing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssb-blob-"));
    const t2 = await startTestServer();
    try {
      const ts = "2026-01-01T00:00:00.000Z";
      const bypass = { bypassDocumentValidation: true };
      const base = {
        citizenId: "legacy", citizenName: "L", issueType: "Dirty Area", category: null, description: "Old",
        location: { address: "x", latitude: 29.89, longitude: 77.96 }, facilityType: null, facilityId: null, priority: "MEDIUM",
        assignedWorkerId: "w1", assignedWorkerName: "W", resolutionNote: "Done.", openKey: null, isDemo: false, createdAt: ts, updatedAt: ts,
      };
      await t2.db.collection("complaints").insertMany(
        [
          { ...base, _id: "SSB2026-0801", status: "RESOLVED", photo: jpeg(40, 1), resolutionPhoto: png(30) },
          { ...base, _id: "SSB2026-0802", status: "SUBMITTED", photo: null, resolutionPhoto: null },
        ],
        bypass
      );
      await t2.db.collection("facility_requests").insertOne(
        { _id: "FR-2026-801", facilityType: "Dustbin", suggestedName: "Old", address: "x", latitude: 29.89, longitude: 77.96, reason: "legacy request", description: "", priority: "LOW", photo: jpeg(20, 2), status: "PENDING", rejectionReason: "", requestedByUser: "w-legacy", requestedByWorkerId: "w1", requestedByWorkerName: "W", reviewedBy: null, isDemo: false, createdAt: ts, updatedAt: ts },
        bypass
      );

      const withoutStore = await runScript(t2, "migrate");
      assert.notEqual(withoutStore.status, 0, "fails loudly when photos are waiting and no store is configured");
      assert.match(withoutStore.out, /3 photos are still stored in MongoDB/);
      assert.ok(await t2.db.collection("complaints").findOne({ _id: "SSB2026-0801", photo: { $type: "string" } }), "nothing was changed");

      const env = { ECOSETU_BLOB_FAKE_DIR: dir };
      const first = await runScript(t2, "migrate", [], env);
      assert.equal(first.status, 0, first.out);
      assert.match(first.out, /photos: 3 moved to private Blob storage/);
      const c = await t2.db.collection("complaints").findOne({ _id: "SSB2026-0801" });
      assert.equal(c.photo, undefined);
      assert.equal(c.resolutionPhoto, undefined);
      assert.match(c.photoPath, /^complaints\/SSB2026-0801-[0-9a-f]{16}\.jpg$/);
      assert.match(c.resolutionPhotoPath, /^resolutions\/SSB2026-0801-[0-9a-f]{16}\.png$/);
      const r = await t2.db.collection("facility_requests").findOne({ _id: "FR-2026-801" });
      assert.match(r.photoPath, /^facility-requests\/FR-2026-801-[0-9a-f]{16}\.jpg$/);
      assert.deepEqual(fs.readFileSync(path.join(dir, c.photoPath)), Buffer.alloc(40, 1), "the bytes made it across intact");

      const snapshot = JSON.stringify(await t2.db.collection("complaints").find().sort({ _id: 1 }).toArray());
      const second = await runScript(t2, "migrate", [], env);
      assert.equal(second.status, 0, second.out);
      assert.match(second.out, /Nothing to change/);
      assert.equal(JSON.stringify(await t2.db.collection("complaints").find().sort({ _id: 1 }).toArray()), snapshot);
    } finally {
      await t2.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
