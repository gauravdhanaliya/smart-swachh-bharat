// Sign-in (POST /api/auth/firebase): email + password accounts only.
//   - "password": a new account is a citizen at once, verified or not; a
//     worker or official role granted to its email applies only once Firebase
//     says the email is verified. New accounts are limited per IP.
//   - "anonymous": refused (there is no "Continue without account" any more)
//   - "phone": the old sign-in; accounts it made keep working, no new ones
//   - the email itself is never stored: a keyed hash and a masked copy only

import { test, before, after, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { apiClient, emailFor, idToken, startTestServer } from "./helpers.js";

let t;
let api;

before(async () => {
  t = await startTestServer();
  api = apiClient(t);
});
after(() => t.stop());

const login = (token, extra = {}) => api.call("POST", "/api/auth/firebase", { body: { idToken: token, ...extra } });
const hmac = (email) => crypto.createHmac("sha256", t.config.identityHashSecret).update(email.trim().toLowerCase()).digest("hex");

/** Every document in every collection, as one string: to prove something is NOT stored. */
async function wholeDatabase() {
  const out = [];
  for (const { name } of await t.db.listCollections().toArray()) out.push(JSON.stringify(await t.db.collection(name).find({}).toArray()));
  return out.join("\n");
}

describe("anonymous sign-in is gone", () => {
  test("an anonymous Firebase token is refused, and no account is made", async () => {
    const res = await login(await idToken({ uid: "anon-1", provider: "anonymous" }));
    assert.equal(res.status, 403);
    assert.match(res.json.error, /log in with email|create an account/i);
    assert.equal(await t.repo.getUserByUid("anon-1"), null);
  });

  test("an account an earlier build made anonymously can't sign in that way either", async () => {
    await t.db.collection("users").insertOne({
      uid: "old-anon", role: "citizen", name: "citizen", workerId: null, isDemo: false,
      authProvider: "anonymous", emailHash: null, emailMasked: null, emailVerified: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }, { bypassDocumentValidation: true });
    assert.equal((await login(await idToken({ uid: "old-anon", provider: "anonymous" }))).status, 403);
  });
});

describe("email accounts are citizens from the first sign-in", () => {
  test("a new account, verified or not, is a citizen with only a hash and a masked copy of its email", async () => {
    const res = await login(await idToken({ uid: "new-1", provider: "password", email: "new.one@example.test", emailVerified: false }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.user.role, "citizen");
    assert.deepEqual(res.json.user.account, { type: "email", email: "ne***@e***.test", emailVerified: false });
    assert.equal(res.json.user.phone, undefined, "no phone field any more");
    const doc = await t.db.collection("users").findOne({ uid: "new-1" });
    assert.equal(doc.authProvider, "password");
    assert.equal(doc.phoneHash, undefined);
  });

  test("signing in again is the same user, with the same complaints", async () => {
    const first = await login(await idToken({ uid: "anon-2", provider: "password" }));
    const created = await api.call("POST", "/api/complaints", {
      token: first.json.accessToken,
      body: { issueType: "Overflowing Bin", description: "Kept across sign-ins", location: { address: "Test road", latitude: 29.86, longitude: 77.89 } },
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const again = await login(await idToken({ uid: "anon-2", provider: "password" }));
    const mine = await api.call("GET", "/api/complaints", { token: again.json.accessToken }); // a citizen sees their own
    assert.ok(mine.json.items.some((c) => c.description === "Kept across sign-ins"));
  });

  test("a client still can't choose a role", async () => {
    const token = await idToken({ uid: "anon-greedy", provider: "password" });
    for (const extra of [{ role: "official" }, { workerId: "w1" }, { email: "boss@example.test" }]) {
      assert.equal((await login(token, extra)).status, 400, JSON.stringify(extra));
    }
  });
});

describe("the email is stored only hashed and masked", () => {
  test("a keyed hash and a masked copy, never the address", async () => {
    const email = "Asha.Verma@Example.TEST";
    const res = await login(await idToken({ uid: "linker", provider: "password", email, emailVerified: false }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.user.role, "citizen");
    assert.deepEqual(res.json.user.account, { type: "email", email: "as***@e***.test", emailVerified: false });
    const doc = await t.db.collection("users").findOne({ uid: "linker" });
    assert.equal(doc.authProvider, "password");
    assert.equal(doc.emailHash, hmac(email), "HMAC of the lowercased address");
    assert.equal(doc.emailHash, hmac("asha.verma@example.test"), "case doesn't matter");
    assert.equal(doc.emailMasked, "as***@e***.test");
    const everything = (await wholeDatabase()).toLowerCase();
    assert.ok(!everything.includes("asha.verma@example.test"), "the address is stored nowhere");
    assert.ok(!everything.includes("asha.verma"), "not even the local part");
  });

  test("the verified flag follows the token", async () => {
    await login(await idToken({ uid: "verifier", provider: "password", email: "v@example.test", emailVerified: false }));
    const res = await login(await idToken({ uid: "verifier", provider: "password", email: "v@example.test", emailVerified: true }));
    assert.equal(res.json.user.account.emailVerified, true);
  });

  test("a password token without an email is refused", async () => {
    const res = await login(await idToken({ uid: "no-mail", provider: "password", email: null }));
    assert.equal(res.status, 400);
  });

  test("two accounts can't hold the same email", async () => {
    assert.equal((await login(await idToken({ uid: "dup-1", provider: "password", email: "same@example.test" }))).status, 200);
    assert.equal((await login(await idToken({ uid: "dup-2", provider: "password", email: "SAME@example.test" }))).status, 409);
  });
});

describe("granting staff roles by email", () => {
  test("a role granted before sign-in is pending (keyed by the email hash), and applied once the email is verified", async () => {
    const email = "officer.one@example.test";
    assert.equal((await t.repo.grantRole({ email, role: "official" })).status, "pending");
    const pending = await t.db.collection("pending_roles").findOne({ _id: hmac(email) });
    assert.equal(pending.role, "official");
    assert.equal(pending.kind, "email");

    // Unverified: anyone could type this address, so the role is NOT applied.
    const unverified = await login(await idToken({ uid: "officer-1", provider: "password", email, emailVerified: false }));
    assert.equal(unverified.json.user.role, "citizen");
    assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: hmac(email) }), 1, "still pending");

    const verified = await login(await idToken({ uid: "officer-1", provider: "password", email, emailVerified: true }));
    assert.equal(verified.json.user.role, "official");
    assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: hmac(email) }), 0, "consumed");
    assert.equal((await api.call("GET", "/api/locations/removed", { token: verified.json.accessToken })).status, 200);
  });

  test("granting to an existing verified account updates it at once; an unverified one stays pending", async () => {
    await login(await idToken({ uid: "w-ver", provider: "password", email: "w.ver@example.test", emailVerified: true }));
    assert.equal((await t.repo.grantRole({ email: "W.Ver@example.test", role: "worker", workerId: "w1" })).status, "updated");
    assert.equal((await t.repo.getUserByUid("w-ver")).role, "worker");

    await login(await idToken({ uid: "w-unver", provider: "password", email: "w.unver@example.test", emailVerified: false }));
    assert.equal((await t.repo.grantRole({ email: "w.unver@example.test", role: "worker" })).status, "pending");
    assert.equal((await t.repo.getUserByUid("w-unver")).role, "citizen");
  });

  test("an account made with someone else's (unverified) email doesn't get their role", async () => {
    await t.repo.grantRole({ email: "real.official@example.test", role: "official" });
    const res = await login(await idToken({ uid: "impostor", provider: "password", email: "real.official@example.test", emailVerified: false }));
    assert.equal(res.json.user.role, "citizen");
  });

  test("the role stays on later sign-ins", async () => {
    const { user } = await api.signIn("stays-worker", { role: "worker", workerId: "w1" });
    assert.equal(user.role, "worker");
    const again = await login(await idToken({ uid: "stays-worker", provider: "password", email: emailFor("stays-worker") }));
    assert.equal(again.json.user.role, "worker");
    assert.equal(again.json.user.wid, "w1");
  });
});

describe("old phone accounts and other providers", () => {
  test("an account made by the old phone sign-in keeps working; no new phone accounts", async () => {
    await t.db.collection("users").insertOne({
      uid: "legacy-phone", role: "worker", name: "Old Worker", workerId: "w1", isDemo: false,
      authProvider: "phone", emailHash: null, emailMasked: null, emailVerified: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const ok = await login(await idToken({ uid: "legacy-phone", provider: "phone" }));
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.user.role, "worker");
    assert.equal(ok.json.user.account.type, "legacy");
    assert.equal((await login(await idToken({ uid: "brand-new-phone", provider: "phone" }))).status, 403);
    assert.equal(await t.repo.getUserByUid("brand-new-phone"), null);
  });

  test("other sign-in providers are refused", async () => {
    for (const provider of ["google.com", "custom", ""]) {
      assert.equal((await login(await idToken({ uid: `p-${provider || "none"}`, provider }))).status, 403, provider);
    }
  });
});

describe("abuse limits", () => {
  let v;
  let vapi;
  beforeEach(async () => {
    await v?.stop();
    v = await startTestServer({
      VERCEL: "1",
      BLOB_READ_WRITE_TOKEN: "test-blob-token",
      ECOSETU_SIGNUP_RATE_MAX: "3",
      ECOSETU_COMPLAINT_RATE_MAX: "2",
      ECOSETU_COMPLAINT_IP_RATE_MAX: "3",
      ECOSETU_RATING_RATE_MAX: "2",
      ECOSETU_RATING_IP_RATE_MAX: "3",
      ECOSETU_VOTE_RATE_MAX: "2",
      ECOSETU_VOTE_IP_RATE_MAX: "3",
    });
    vapi = apiClient(v);
  });
  after(() => v?.stop());

  const from = (ip) => ({ "x-real-ip": ip });
  const signUp = async (uid, ip) =>
    vapi.call("POST", "/api/auth/firebase", { body: { idToken: await idToken({ uid, provider: "password" }) }, headers: from(ip) });

  test("sign-ups (an account's first sign-in) are limited per IP; returning ones and other IPs aren't", async () => {
    for (const n of [1, 2, 3]) assert.equal((await signUp(`ip-a-${n}`, "203.0.113.1")).status, 200, `account ${n}`);
    const fourth = await signUp("ip-a-4", "203.0.113.1");
    assert.equal(fourth.status, 429);
    assert.equal(await v.repo.getUserByUid("ip-a-4"), null, "no account was made");
    assert.equal((await signUp("ip-a-1", "203.0.113.1")).status, 200, "an existing account can always sign in again");
    assert.equal((await signUp("ip-b-1", "203.0.113.2")).status, 200, "another IP is not affected");
  });

  test("returning sign-ins don't use up the sign-up budget", async () => {
    assert.equal((await signUp("ip-c-1", "203.0.113.3")).status, 200);
    for (let i = 0; i < 5; i++) assert.equal((await signUp("ip-c-1", "203.0.113.3")).status, 200, `return ${i + 1}`);
    assert.equal((await signUp("ip-c-2", "203.0.113.3")).status, 200, "a second new account still fits");
    assert.equal((await signUp("ip-c-3", "203.0.113.3")).status, 200, "and a third (the limit is 3 new ones)");
    assert.equal((await signUp("ip-c-4", "203.0.113.3")).status, 429);
  });

  async function citizenAt(uid, ip) {
    const res = await signUp(uid, ip);
    assert.equal(res.status, 200);
    return res.json.accessToken;
  }
  const complaint = (token, ip, n) =>
    vapi.call("POST", "/api/complaints", {
      token,
      headers: from(ip),
      body: { issueType: "Overflowing Bin", description: `Limit test ${ip} ${n}`, location: { address: "Test road", latitude: 29.86 + n / 1000, longitude: 77.89 } },
    });

  test("complaints: per user and per IP", async () => {
    const a = await citizenAt("c-a", "198.51.100.1");
    assert.equal((await complaint(a, "198.51.100.1", 1)).status, 201);
    assert.equal((await complaint(a, "198.51.100.1", 2)).status, 201);
    assert.equal((await complaint(a, "198.51.100.1", 3)).status, 429, "per user (2)");
    const b = await citizenAt("c-b", "198.51.100.1");
    assert.equal((await complaint(b, "198.51.100.1", 4)).status, 201, "a second user on the same IP");
    assert.equal((await complaint(b, "198.51.100.1", 5)).status, 429, "per IP (3)");
    const c = await citizenAt("c-c", "198.51.100.2");
    assert.equal((await complaint(c, "198.51.100.2", 6)).status, 201, "another IP");
  });

  test("toilet ratings: per user and per IP", async () => {
    const { DEMO_TOILETS } = await import("../src/seed-data.js");
    const { seedAll } = await import("../src/seed.js");
    await seedAll(v.repo, { demo: true });
    const toilets = DEMO_TOILETS.map((x) => x.id);
    const rate = (token, ip, id) => vapi.call("PUT", `/api/toilets/${id}/rating`, { token, headers: from(ip), body: { stars: 4 } });
    const a = await citizenAt("r-a", "198.51.100.3");
    assert.equal((await rate(a, "198.51.100.3", toilets[0])).status, 200);
    assert.equal((await rate(a, "198.51.100.3", toilets[1])).status, 200);
    assert.equal((await rate(a, "198.51.100.3", toilets[2])).status, 429, "per user (2)");
    const b = await citizenAt("r-b", "198.51.100.3");
    assert.equal((await rate(b, "198.51.100.3", toilets[0])).status, 200);
    assert.equal((await rate(b, "198.51.100.3", toilets[1])).status, 429, "per IP (3)");
  });

  test("votes: per user and per IP", async () => {
    // A citizen votes on their own complaints (that's all they can see). Each
    // voter files theirs from another IP, so filing doesn't use up the vote IP.
    const voterWithComplaint = async (uid) => {
      const token = await citizenAt(uid, "198.51.100.20");
      const made = await complaint(token, "198.51.100.20", uid.length);
      assert.equal(made.status, 201, JSON.stringify(made.json));
      return { token, id: made.json.complaint.id };
    };
    const vote = (who, direction) => vapi.call("POST", `/api/complaints/${who.id}/vote`, { token: who.token, headers: from("198.51.100.4"), body: { direction } });
    const a = await voterWithComplaint("v-a");
    assert.equal((await vote(a, "up")).status, 200);
    assert.equal((await vote(a, null)).status, 200);
    assert.equal((await vote(a, "up")).status, 429, "per user (2)");
    const b = await voterWithComplaint("v-bb");
    assert.equal((await vote(b, "up")).status, 200);
    assert.equal((await vote(b, "down")).status, 429, "per IP (3)");
  });
});

describe("delete my data", () => {
  test("the account and its email hash go", async () => {
    const res = await login(await idToken({ uid: "linked-del", provider: "password", email: "gone@example.test" }));
    const del = await api.call("DELETE", "/api/me/data", { token: res.json.accessToken, body: { confirm: true } });
    assert.equal(del.status, 200, JSON.stringify(del.json));
    assert.equal(await t.db.collection("users").countDocuments({ emailHash: hmac("gone@example.test") }), 0);
    assert.equal(await t.repo.getUserByUid("linked-del"), null);
  });
});
