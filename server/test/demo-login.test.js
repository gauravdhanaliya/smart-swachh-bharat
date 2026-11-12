// POST /api/auth/demo: the labelled demo login, done on the server.
//   - off (404) unless DEMO_LOGIN_ENABLED=true
//   - the only thing a client chooses is WHICH of the three seeded demo users
//   - the role comes from the database, like every other login
//   - limited on its own, stricter than the rest of /api/auth

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { seedAll } from "../src/seed.js";
import { idToken, startTestServer } from "./helpers.js";

const WEB = { "x-ecosetu-client": "web" };

async function call(base, method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, json, cookies: res.headers.getSetCookie?.() ?? [] };
}
const refreshCookie = (res) => res.cookies.find((c) => c.startsWith("ssb_refresh="))?.split(";")[0] ?? "";

describe("demo login switched off (the default)", () => {
  let t;
  before(async () => {
    t = await startTestServer();
    await seedAll(t.repo, { demo: true });
  });
  after(() => t.stop());

  test("answers 404 exactly like a route that doesn't exist, and sets no cookie", async () => {
    const res = await call(t.base, "POST", "/api/auth/demo", { body: { role: "official" } });
    const missing = await call(t.base, "POST", "/api/auth/nope", { body: { role: "official" } });
    assert.equal(res.status, 404);
    assert.deepEqual(res.json, missing.json);
    assert.deepEqual(res.cookies, []);
  });
});

describe("demo login switched on", () => {
  let t;
  before(async () => {
    t = await startTestServer({ DEMO_LOGIN_ENABLED: "true", ECOSETU_DEMO_RATE_MAX: "1000" });
    await seedAll(t.repo, { demo: true });
  });
  after(() => t.stop());

  for (const [asked, uid, role] of [
    ["citizen", "demo-citizen", "citizen"],
    ["worker", "demo-worker", "worker"],
    ["official", "demo-official", "official"],
    ["government", "demo-official", "official"],
  ]) {
    test(`"${asked}" signs in as the seeded ${uid}`, async () => {
      const res = await call(t.base, "POST", "/api/auth/demo", { body: { role: asked } });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.user.uid, uid);
      assert.equal(res.json.user.role, role);
      assert.equal(res.json.user.isDemo, true);
      assert.equal(res.json.user.phone, null, "demo users have no phone number");
      assert.match(refreshCookie(res), /^ssb_refresh=/);

      const me = await call(t.base, "GET", "/api/auth/me", { token: res.json.accessToken });
      assert.equal(me.status, 200);
      assert.equal(me.json.user.uid, uid);
      const refreshed = await call(t.base, "POST", "/api/auth/refresh", { headers: { ...WEB, cookie: refreshCookie(res) } });
      assert.equal(refreshed.status, 200);
      assert.equal(refreshed.json.user.uid, uid);
    });
  }

  test("the worker demo user is linked to demo worker w1", async () => {
    const res = await call(t.base, "POST", "/api/auth/demo", { body: { role: "worker" } });
    assert.equal(res.json.user.wid, "w1");
  });

  test("anything besides the choice of demo user is refused", async () => {
    const bad = [
      {},
      { role: "superadmin" },
      { role: "supervisor" },
      { role: "" },
      { role: { $gt: "" } },
      { role: ["citizen"] },
      { role: "citizen", uid: "someone-else" },
      { role: "citizen", name: "Hacker" },
      { role: "citizen", workerId: "w2" },
      { role: "official", isAdmin: true },
      [],
      "citizen",
    ];
    for (const body of bad) {
      const res = await call(t.base, "POST", "/api/auth/demo", { body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(res.cookies, [], JSON.stringify(body));
    }
  });

  test("the role comes from the database, not from what was asked for", async () => {
    await t.repo.grantRole({ uid: "demo-citizen", role: "worker", workerId: "w2" });
    try {
      const res = await call(t.base, "POST", "/api/auth/demo", { body: { role: "citizen" } });
      assert.equal(res.json.user.uid, "demo-citizen");
      assert.equal(res.json.user.role, "worker");
    } finally {
      await t.repo.grantRole({ uid: "demo-citizen", role: "citizen", workerId: null });
    }
  });

  test("a Firebase login can never take over a demo account", async () => {
    for (const path of ["/api/auth/firebase", "/api/auth/firebase-login"]) {
      const res = await call(t.base, "POST", path, { body: { idToken: await idToken({ uid: "demo-official", phone: "+919000044401" }) } });
      assert.equal(res.status, 403, path);
      assert.deepEqual(res.cookies, []);
    }
    const doc = await t.db.collection("users").findOne({ uid: "demo-official" });
    assert.equal(doc.phoneHash, null, "the demo account was not given a phone");
    assert.equal(doc.role, "official");
  });

  test("POST /api/auth/firebase is the login route (firebase-login stays as an alias)", async () => {
    const res = await call(t.base, "POST", "/api/auth/firebase", { body: { idToken: await idToken({ uid: "fb-route", phone: "+919000044402" }) } });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.role, "citizen");
    assert.equal(res.json.user.isDemo, false);
  });

  test("the access token carries only sub (the user id) and role", async () => {
    const res = await call(t.base, "POST", "/api/auth/demo", { body: { role: "official" } });
    const payload = JSON.parse(Buffer.from(res.json.accessToken.split(".")[1], "base64url").toString());
    assert.equal(payload.sub, "demo-official");
    assert.equal(payload.role, "official");
    assert.deepEqual(Object.keys(payload).sort(), ["aud", "exp", "iat", "iss", "role", "sub"]);
  });
});

describe("demo login without seeded demo users", () => {
  let t;
  before(async () => {
    t = await startTestServer({ DEMO_LOGIN_ENABLED: "true" });
  });
  after(() => t.stop());

  test("explains that the demo accounts are missing instead of creating one", async () => {
    const res = await call(t.base, "POST", "/api/auth/demo", { body: { role: "citizen" } });
    assert.equal(res.status, 503);
    assert.match(res.json.error, /demo accounts/i);
    assert.equal(await t.db.collection("users").countDocuments(), 0);
  });

  test("a real (non-demo) user with a demo uid is never used for a demo login", async () => {
    await t.repo.upsertUser({ uid: "demo-citizen", phone: "9000044403", name: "Real person" });
    const res = await call(t.base, "POST", "/api/auth/demo", { body: { role: "citizen" } });
    assert.equal(res.status, 503);
  });
});

describe("demo login rate limit", () => {
  let t;
  before(async () => {
    t = await startTestServer({ DEMO_LOGIN_ENABLED: "true", ECOSETU_DEMO_RATE_MAX: "3", ECOSETU_DEMO_RATE_WINDOW_MS: "60000" });
    await seedAll(t.repo, { demo: true });
  });
  after(() => t.stop());

  test("has its own, stricter limit, counted in MongoDB", async () => {
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await call(t.base, "POST", "/api/auth/demo", { body: { role: "citizen" } })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    assert.ok(await t.db.collection("auth_rate_limits").findOne({ _id: /^demo:/ }));
    // other auth routes still have their own budget
    assert.equal((await call(t.base, "POST", "/api/auth/refresh", { headers: WEB })).status, 401);
  });
});

// For presentations: demo accounts are shared, so once someone accepts the
// privacy notice the consent screen never shows again. A demo account can
// reset the demo accounts' consent; nobody else can, and only when demo
// login is switched on.
describe("reset demo consent", () => {
  const ITEMS = { phoneForLogin: false, locationWhenReporting: true, photosAttached: true, readNotice: true };
  let t;
  before(async () => {
    t = await startTestServer({ DEMO_LOGIN_ENABLED: "true" });
    await seedAll(t.repo, { demo: true });
  });
  after(() => t.stop());

  const demo = async (role) => (await call(t.base, "POST", "/api/auth/demo", { body: { role }, headers: WEB })).json.accessToken;
  const accept = (token, items = ITEMS) => call(t.base, "PUT", "/api/me/consent", { token, body: { version: 1, items } });
  const consentOf = async (token) => (await call(t.base, "GET", "/api/me/consent", { token })).json;

  test("a demo account resets consent for every demo account, and stays signed in", async () => {
    const citizen = await demo("citizen");
    const official = await demo("official");
    await accept(citizen);
    await accept(official);
    assert.equal((await consentOf(citizen)).upToDate, true);

    const res = await call(t.base, "POST", "/api/me/consent/reset-demo", { token: citizen });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.reset, 2);
    assert.equal((await consentOf(citizen)).upToDate, false, "asked again on next screen");
    assert.equal((await consentOf(official)).upToDate, false, "and on the other demo accounts");
  });

  test("a real account can't use it, and its own consent is untouched", async () => {
    const real = (await call(t.base, "POST", "/api/auth/firebase", { body: { idToken: await idToken({ uid: "real-person-1" }) } })).json.accessToken;
    assert.equal((await accept(real, { ...ITEMS, phoneForLogin: true })).status, 200); // phone users accept the phone item too
    const res = await call(t.base, "POST", "/api/me/consent/reset-demo", { token: real });
    assert.equal(res.status, 403);
    assert.equal((await consentOf(real)).upToDate, true);
    const citizen = await demo("citizen");
    await accept(citizen);
    await call(t.base, "POST", "/api/me/consent/reset-demo", { token: citizen });
    assert.equal((await consentOf(real)).upToDate, true, "a demo reset never touches real accounts");
  });

  test("needs a signed-in user, and takes no body", async () => {
    assert.equal((await call(t.base, "POST", "/api/me/consent/reset-demo")).status, 401);
    const citizen = await demo("citizen");
    assert.equal((await call(t.base, "POST", "/api/me/consent/reset-demo", { token: citizen, body: { all: true } })).status, 400);
  });
});

describe("reset demo consent with demo login switched off", () => {
  let t;
  before(async () => {
    t = await startTestServer();
    await seedAll(t.repo, { demo: true });
  });
  after(() => t.stop());

  test("the route doesn't exist", async () => {
    const real = (await call(t.base, "POST", "/api/auth/firebase", { body: { idToken: await idToken({ uid: "real-person-2" }) } })).json.accessToken;
    assert.equal((await call(t.base, "POST", "/api/me/consent/reset-demo", { token: real })).status, 404);
  });
});
