// Workers are added only by an official, from the worker directory: name and
// email. That makes a pending worker role for the email (stored as a keyed
// hash and a masked copy, never the address). Whoever creates an account with
// that email and verifies it becomes that worker. Removing the worker from the
// directory takes the role away; restoring gives it back. The demo login is
// the only other way to be a worker.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { seedAll } from "../src/seed.js";
import { apiClient, idToken, startTestServer } from "./helpers.js";

let t;
let api;
let official;
let citizen;

before(async () => {
  t = await startTestServer();
  api = apiClient(t);
  await seedAll(t.repo, { demo: true });
  official = await api.signIn("wi-official", { role: "official" });
  citizen = await api.signIn("wi-citizen");
});
after(() => t.stop());

const hmac = (email) => crypto.createHmac("sha256", t.config.identityHashSecret).update(email.trim().toLowerCase()).digest("hex");
const add = (body, who = official) => api.call("POST", "/api/workers", { token: who.token, body });
const login = async (uid, email, emailVerified = true) => {
  const res = await api.call("POST", "/api/auth/firebase", { body: { idToken: await idToken({ uid, provider: "password", email, emailVerified }) } });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json;
};

async function wholeDatabase() {
  const out = [];
  for (const { name } of await t.db.listCollections().toArray()) out.push(JSON.stringify(await t.db.collection(name).find({}).toArray()));
  return out.join("\n").toLowerCase();
}

describe("adding a worker", () => {
  test("name + email: a directory entry with the email masked, and a pending worker role keyed by its hash", async () => {
    const res = await add({ name: "  Meena Devi ", email: "Meena.Devi@Example.TEST", area: "Ganeshpur" });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const w = res.json.worker;
    assert.deepEqual([w.name, w.area, w.emailMasked, w.accountStatus, w.source], ["Meena Devi", "Ganeshpur", "me***@e***.test", "invited", "GOVERNMENT"]);
    assert.equal(w.email, undefined);
    const pending = await t.db.collection("pending_roles").findOne({ _id: hmac("meena.devi@example.test") });
    assert.deepEqual([pending.kind, pending.role, pending.workerId], ["email", "worker", w.id]);
    assert.ok(!(await wholeDatabase()).includes("meena.devi@example.test"), "the address is stored nowhere");
  });

  test("the area is optional; the email is required and checked; nothing else is accepted", async () => {
    const ok = await add({ name: "No Area", email: "no.area@example.test" });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    for (const body of [{ name: "A" }, { name: "A", email: "not-an-email" }, { email: "a@example.test" }, { name: "A", email: "a2@example.test", phone: "9876543210" }, { name: "A", email: "a3@example.test", role: "official" }, { name: "A", email: "a4@example.test", workerId: "w1" }]) {
      assert.equal((await add(body)).status, 400, JSON.stringify(body));
    }
  });

  test("only officials can add workers", async () => {
    const worker = await api.signIn("wi-some-worker", { role: "worker", workerId: "w2" });
    for (const who of [citizen, worker]) assert.equal((await add({ name: "X", email: "x@example.test" }, who)).status, 403);
    assert.equal((await api.call("POST", "/api/workers", { body: { name: "X", email: "x@example.test" } })).status, 401);
  });

  test("the same email can't be in the directory twice, and an official's email can't be made a worker", async () => {
    assert.equal((await add({ name: "Twice", email: "twice@example.test" })).status, 201);
    assert.equal((await add({ name: "Twice again", email: "TWICE@example.test" })).status, 409);
    await login("wi-boss", "boss@example.test");
    await t.repo.grantRole({ email: "boss@example.test", role: "official" });
    const res = await add({ name: "Boss", email: "boss@example.test" });
    assert.equal(res.status, 409);
    assert.equal((await t.repo.getUserByUid("wi-boss")).role, "official", "unchanged");
  });
});

describe("becoming that worker", () => {
  test("whoever creates an account with the email becomes the worker once it is verified, not before", async () => {
    const { worker } = (await add({ name: "Ravi", email: "ravi@example.test" })).json;
    const unverified = await login("wi-ravi", "ravi@example.test", false);
    assert.equal(unverified.user.role, "citizen");
    const verified = await login("wi-ravi", "ravi@example.test", true);
    assert.equal(verified.user.role, "worker");
    assert.equal(verified.user.wid, worker.id);
    const list = await api.listAll("/api/workers", "items", official.token);
    assert.equal(list.find((w) => w.id === worker.id).accountStatus, "active");
    assert.equal((await api.call("GET", "/api/complaints", { token: verified.accessToken })).status, 200);
  });

  test("a citizen who already has a verified account with that email becomes the worker at once", async () => {
    await login("wi-existing", "existing@example.test");
    const { worker } = (await add({ name: "Existing", email: "existing@example.test" })).json;
    assert.equal(worker.accountStatus, "active");
    const user = await t.repo.getUserByUid("wi-existing");
    assert.deepEqual([user.role, user.workerId], ["worker", worker.id]);
    assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: hmac("existing@example.test") }), 0);
  });
});

describe("remove and restore", () => {
  test("removing takes the worker role away at once; restoring gives it back", async () => {
    const { worker } = (await add({ name: "Sita", email: "sita@example.test" })).json;
    const session = await login("wi-sita", "sita@example.test");
    assert.equal(session.user.role, "worker");

    const removed = await api.call("DELETE", `/api/workers/${worker.id}`, { token: official.token, body: { reason: "left" } });
    assert.equal(removed.status, 200, JSON.stringify(removed.json));
    const after = await t.repo.getUserByUid("wi-sita");
    assert.deepEqual([after.role, after.workerId], ["citizen", null]);
    assert.equal((await api.call("GET", "/api/complaints", { token: session.accessToken })).status, 401, "the old worker token stops working");

    assert.equal((await api.call("POST", `/api/workers/${worker.id}/restore`, { token: official.token })).status, 200);
    const back = await t.repo.getUserByUid("wi-sita");
    assert.deepEqual([back.role, back.workerId], ["worker", worker.id]);
  });

  test("removing someone who hasn't signed up yet cancels the invite; restoring makes it again", async () => {
    const { worker } = (await add({ name: "Gita", email: "gita@example.test" })).json;
    await api.call("DELETE", `/api/workers/${worker.id}`, { token: official.token, body: {} });
    assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: hmac("gita@example.test") }), 0);
    assert.equal((await login("wi-gita", "gita@example.test")).user.role, "citizen", "no role after the invite was cancelled");

    await api.call("POST", `/api/workers/${worker.id}/restore`, { token: official.token });
    const again = await login("wi-gita", "gita@example.test");
    assert.equal(again.user.role, "worker");
  });

  test("removing the demo worker from the directory leaves the demo login working", async () => {
    await api.call("DELETE", "/api/workers/w1", { token: official.token, body: {} });
    try {
      assert.equal((await t.repo.getUserByUid("demo-worker")).role, "worker");
    } finally {
      await api.call("POST", "/api/workers/w1/restore", { token: official.token });
    }
  });
});

