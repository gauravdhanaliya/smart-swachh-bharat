import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { migrateLegacyBins } from "../src/db.js";
import { seedIfEmpty } from "../src/seed.js";
import { signAccessToken } from "../src/tokens.js";
import { idToken, phoneFor, startTestServer } from "./helpers.js";
import { createApp } from "../src/app.js";
import { createFirebaseVerifier } from "../src/firebase.js";
import { MAX_PHOTO_BYTES } from "../src/validate.js";
import { hashPhone } from "../src/phone.js";

let t; // the running test server
let base;
let config;

before(async () => {
  t = await startTestServer();
  ({ base, config } = t);
  await seedIfEmpty(t.repo, { demo: true });
});

after(() => t.stop());

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, json, cookies: res.headers.getSetCookie?.() ?? [] };
}

// Every item of a paged list (pages of 100).
async function listAll(path, key, token) {
  const out = [];
  for (let page = 1; page < 100; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await call("GET", `${path}${sep}page=${page}&limit=100`, { token });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    out.push(...res.json[key]);
    if (!res.json.hasMore) return out;
  }
  throw new Error("too many pages");
}

// The refresh cookie ("ssb_refresh=...") from a response, ready to send back.
const refreshCookie = (res) => res.cookies.find((c) => c.startsWith("ssb_refresh="))?.split(";")[0] ?? "";
const WEB = { "x-ecosetu-client": "web" };

// Signs a user in the way the app does: a Firebase ID token to
// /auth/firebase-login. The role is NOT sent: like in production it is granted
// beforehand in the database (what `npm run grant-role` does).
// Each role/phone gets its own Firebase uid.
async function loginFull(role, { phone, workerId } = {}) {
  const uid = `u-${role}${phone ? `-${phone}` : ""}`;
  const number = phone ?? phoneFor(uid);
  if (role !== "citizen") await t.repo.grantRole({ phone: number.slice(-10), role, workerId: workerId ?? null });
  const token = await idToken({ uid, phone: number });
  const res = await call("POST", "/api/auth/firebase-login", { body: { idToken: token } });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.user.role, role);
  return res;
}
const login = async (role, extra) => (await loginFull(role, extra)).json.accessToken;

const BIN = {
  name: "Test Bin",
  type: "dustbin",
  latitude: 29.8905551,
  longitude: 77.9601633,
  address: "Near test block",
  details: { wasteType: "Dry Waste" },
};

const REQ = {
  facilityType: "Dustbin",
  suggestedName: "Bin by workshop",
  location: { address: "Workshop road", latitude: 29.8899, longitude: 77.96 },
  reason: "Waste piles up here daily",
  priority: "HIGH",
  requestedByWorkerId: "w1",
  requestedByWorkerName: "Vikash Kumar",
};


describe("authentication", () => {
  test("citizen signs in and gets an access token + refresh cookie", async () => {
    const token = await idToken({ uid: "c1" });
    const res = await call("POST", "/api/auth/firebase-login", { body: { idToken: token } });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.role, "citizen");
    assert.equal(res.json.expiresIn, 900);
    assert.equal(res.json.refreshToken, undefined, "the refresh token is only in the httpOnly cookie");
    const cookie = res.cookies.find((c) => c.startsWith("ssb_refresh="));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api\/auth/);
  });

  test("the access token holds only uid and role, signed with the access secret", async () => {
    const res = await loginFull("official");
    const payload = JSON.parse(Buffer.from(res.json.accessToken.split(".")[1], "base64url").toString());
    assert.equal(payload.sub, "u-official");
    assert.equal(payload.role, "official");
    assert.equal(Math.round(payload.exp - payload.iat), 900);
    assert.deepEqual(Object.keys(payload).sort(), ["aud", "exp", "iat", "iss", "role", "sub"]);
  });

  test("a client can never pick its role: a login that tries is refused outright", async () => {
    const token = await idToken({ uid: "greedy" });
    for (const role of ["worker", "official", "government", "superadmin", "supervisor"]) {
      for (const extra of [{ role }, { accessCode: "anything" }, { workerId: "w1" }, { isAdmin: true }]) {
        const res = await call("POST", "/api/auth/firebase-login", { body: { idToken: token, ...extra } });
        assert.equal(res.status, 400, JSON.stringify(extra));
        assert.ok(Object.keys(extra).every((k) => res.json.fields[k]));
      }
    }
    assert.equal(await t.repo.getUserByUid("greedy"), null, "no account was made");
    const plain = await call("POST", "/api/auth/firebase-login", { body: { idToken: token } });
    assert.equal(plain.json.user.role, "citizen");
    assert.equal(plain.json.user.wid, undefined);
    assert.equal((await call("GET", "/api/locations/removed", { token: plain.json.accessToken })).status, 403);
  });

  test("a role granted in the database is returned at login and survives later sign-ins", async () => {
    const res = await loginFull("worker", { phone: "+919000011112", workerId: "w1" });
    assert.equal(res.json.user.wid, "w1");
    const token = await idToken({ uid: "u-worker-+919000011112", phone: "+919000011112" });
    assert.equal((await call("POST", "/api/auth/firebase-login", { body: { idToken: token, role: "citizen" } })).status, 400);
    const again = await call("POST", "/api/auth/firebase-login", { body: { idToken: token } });
    assert.equal(again.json.user.role, "worker", "the role granted in the database stays");
  });

  test("a role granted before the first sign-in is pending, then applied once", async () => {
    const phone = "+919000012345";
    const granted = await t.repo.grantRole({ phone: phone.slice(-10), role: "official" });
    assert.equal(granted.status, "pending");
    const pendingKey = hashPhone(phone.slice(-10), t.config.phoneHashSecret);
    assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: pendingKey }), 1);
    assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: phone.slice(-10) }), 0, "never keyed by the number itself");
    const token = await idToken({ uid: "late-joiner", phone });
    const res = await call("POST", "/api/auth/firebase-login", { body: { idToken: token } });
    assert.equal(res.json.user.role, "official");
    assert.equal(await t.db.collection("pending_roles").countDocuments({ _id: pendingKey }), 0, "pending record is consumed");
    assert.equal((await call("GET", "/api/locations/removed", { token: res.json.accessToken })).status, 200);
    // and now that the user exists, granting again updates them directly
    assert.equal((await t.repo.grantRole({ phone: phone.slice(-10), role: "worker" })).status, "updated");
    assert.equal((await t.repo.getUserByUid("late-joiner")).role, "worker");
  });

  test("login validates its input", async () => {
    const token = await idToken({ uid: "r1" });
    const bad = [{}, { idToken: 123 }, { idToken: "x".repeat(5000) }, { idToken: token, name: { $gt: "" } }];
    for (const body of bad) {
      assert.equal((await call("POST", "/api/auth/firebase-login", { body })).status, 400, JSON.stringify(body).slice(0, 60));
    }
    assert.equal((await call("POST", "/api/auth/firebase-login", { body: [] })).status, 400);
    const noPhone = await idToken({ uid: "r2", phone: "" });
    assert.equal((await call("POST", "/api/auth/firebase-login", { body: { idToken: noPhone } })).status, 400);
  });

  test("login needs a genuine Firebase token; the phone number comes from it", async () => {
    assert.equal((await call("POST", "/api/auth/firebase-login", { body: { idToken: "nope" } })).status, 401);
    const forged = await idToken({ uid: "f1", forged: true });
    assert.equal((await call("POST", "/api/auth/firebase-login", { body: { idToken: forged } })).status, 401);
    const token = await idToken({ uid: "m1", phone: "+919000011111" });
    assert.equal((await call("POST", "/api/auth/firebase-login", { body: { mobile: "1111111111", idToken: token } })).status, 400, "a client-sent number is refused");
    const res = await call("POST", "/api/auth/firebase-login", { body: { idToken: token } });
    assert.equal(res.json.user.phone, "+91 90XXXXXX11");
  });

  test("tampered, expired and wrong-secret access tokens are rejected", async () => {
    const good = await login("official");
    const [h, p, s] = good.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ uid: "x", role: "superadmin", exp: 9999999999 })).toString("base64url");
    const expired = await signAccessToken({ uid: "u-official", role: "official" }, config.jwtSecret, -10, config.tokenEnv);
    const wrongSecret = await signAccessToken({ uid: "u-official", role: "official" }, "another-secret-another-secret-123", 600, config.tokenEnv);
    const refreshSecret = await signAccessToken({ uid: "u-official", role: "official" }, config.jwtRefreshSecret, 600, config.tokenEnv);
    for (const token of [`${h}.${forgedPayload}.${s}`, `${h}.${p}.AAAA`, "garbage", expired, wrongSecret, refreshSecret]) {
      assert.equal((await call("GET", "/api/locations/removed", { token })).status, 401);
    }
    assert.equal((await call("GET", "/api/locations/removed", { token: good })).status, 200);
  });

  test("a Firebase ID token is not accepted as an API token", async () => {
    await login("official");
    const fb = await idToken({ uid: "u-official" });
    assert.equal((await call("GET", "/api/locations/removed", { token: fb })).status, 401);
  });

  test("a role change invalidates old access tokens until the client refreshes", async () => {
    const token = await idToken({ uid: "chg", phone: "+919000033333" });
    const first = await call("POST", "/api/auth/firebase-login", { body: { idToken: token } });
    assert.equal((await call("GET", "/api/auth/me", { token: first.json.accessToken })).status, 200);
    await t.repo.grantRole({ phone: "9000033333", role: "official" });
    assert.equal((await call("GET", "/api/auth/me", { token: first.json.accessToken })).status, 401);
    const again = await call("POST", "/api/auth/firebase-login", { body: { idToken: token } });
    assert.equal(again.json.user.role, "official");
    assert.equal((await call("GET", "/api/auth/me")).status, 401);
  });

  test("two accounts cannot share a mobile number", async () => {
    const a = await idToken({ uid: "dup-a", phone: "+919000044444" });
    const b = await idToken({ uid: "dup-b", phone: "+919000044444" });
    assert.equal((await call("POST", "/api/auth/firebase-login", { body: { idToken: a } })).status, 200);
    assert.equal((await call("POST", "/api/auth/firebase-login", { body: { idToken: b } })).status, 409);
  });
});

describe("refresh and logout", () => {
  test("refresh rotates the token; the old one stops working and replaying it revokes the rest", async () => {
    const first = await loginFull("citizen", { phone: "+919000055555" });
    const c1 = refreshCookie(first);

    const second = await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: c1 } });
    assert.equal(second.status, 200);
    assert.equal(second.json.user.role, "citizen");
    const c2 = refreshCookie(second);
    assert.notEqual(c2, c1, "a new refresh token is issued");
    assert.equal((await call("GET", "/api/auth/me", { token: second.json.accessToken })).status, 200);

    // replaying the used token is treated as theft: it fails AND the newer one dies with it
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: c1 } })).status, 401);
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: c2 } })).status, 401);
  });

  test("reusing a revoked refresh token signs the user out on every device, even straight away", async () => {
    // the same person signed in on a phone and a laptop
    const phone = await loginFull("citizen", { phone: "+919000055556" });
    const laptopToken = await idToken({ uid: "u-citizen-+919000055556", phone: "+919000055556" });
    const laptop = await call("POST", "/api/auth/firebase-login", { body: { idToken: laptopToken } });
    const phoneOld = refreshCookie(phone);
    const laptopCookie = refreshCookie(laptop);

    const rotated = await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: phoneOld } });
    assert.equal(rotated.status, 200);
    const phoneNew = refreshCookie(rotated);

    // an attacker replays the phone's old token within a second of the rotation
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: phoneOld } })).status, 401);
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: phoneNew } })).status, 401, "the phone's new token is revoked");
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: laptopCookie } })).status, 401, "the laptop is signed out too");
    const live = await t.db.collection("refresh_tokens").countDocuments({ uid: "u-citizen-+919000055556", revokedAt: null });
    assert.equal(live, 0);
  });

  test("reusing a token revoked by logout also revokes the user's other sessions", async () => {
    const a = await loginFull("citizen", { phone: "+919000055557" });
    const second = await call("POST", "/api/auth/firebase-login", {
      body: { idToken: await idToken({ uid: "u-citizen-+919000055557", phone: "+919000055557" }) },
    });
    await call("POST", "/api/auth/logout", { headers: { ...WEB, cookie: refreshCookie(a) } });
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: refreshCookie(a) } })).status, 401);
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: refreshCookie(second) } })).status, 401);
  });

  test("refresh stores only a hash, and fails without a valid cookie", async () => {
    const res = await loginFull("citizen", { phone: "+919000066666" });
    const raw = decodeURIComponent(refreshCookie(res).split("=")[1]);
    const rows = await t.db.collection("refresh_tokens").find({}).toArray();
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.tokenHash !== raw && /^[0-9a-f]{64}$/.test(r.tokenHash)));

    assert.equal((await call("POST", "/api/auth/refresh", { headers: WEB })).status, 401);
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: "ssb_refresh=garbage" } })).status, 401);
    const access = res.json.accessToken; // an access token is not a refresh token
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie: `ssb_refresh=${access}` } })).status, 401);
  });

  test("refresh and logout refuse requests without the web-client header or from a foreign origin", async () => {
    const res = await loginFull("citizen", { phone: "+919000077777" });
    const cookie = refreshCookie(res);
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { cookie } })).status, 403);
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie, origin: "https://evil.example.com" } })).status, 403);
    assert.equal((await call("POST", "/api/auth/logout", { headers: { cookie } })).status, 403);
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie } })).status, 200);
  });

  test("logout revokes the refresh token and clears the cookie", async () => {
    const res = await loginFull("worker", { phone: "+919000088888" });
    const cookie = refreshCookie(res);
    const out = await call("POST", "/api/auth/logout", { headers: { ...WEB, cookie } });
    assert.equal(out.status, 200);
    assert.match(out.cookies.find((c) => c.startsWith("ssb_refresh=")), /Max-Age=0/);
    assert.equal((await call("POST", "/api/auth/refresh", { headers: { ...WEB, cookie } })).status, 401);
    assert.equal((await call("POST", "/api/auth/logout", { headers: WEB })).status, 200, "logout without a cookie is harmless");
  });
});

describe("role enforcement", () => {
  test("a citizen is refused (403) on worker and government routes; no token gets 401", async () => {
    const citizen = await login("citizen");
    assert.equal((await call("GET", "/api/locations/removed", { token: citizen })).status, 403);
    assert.equal((await call("POST", "/api/locations", { token: citizen, body: BIN })).status, 403);
    assert.equal((await call("GET", "/api/facility-requests", { token: citizen })).status, 403);
    assert.equal((await call("POST", "/api/facility-requests", { token: citizen, body: REQ })).status, 403);
    assert.equal((await call("GET", "/api/locations/removed")).status, 401);
  });

  test("a worker is refused (403) on government routes", async () => {
    const worker = await login("worker");
    assert.equal((await call("GET", "/api/locations/removed", { token: worker })).status, 403);
    assert.equal((await call("POST", "/api/locations", { token: worker, body: BIN })).status, 403);
  });
});

describe("auth rate limiting", () => {
  test("the counters are kept in MongoDB, so every server instance shares one limit", async () => {
    const small = await startTestServer({ ECOSETU_AUTH_RATE_MAX: "4", ECOSETU_AUTH_RATE_WINDOW_MS: "60000" });
    // a second app instance on the same database, like a second warm Vercel instance
    const twin = createApp({ config: small.config, repo: small.repo, verifyFirebase: createFirebaseVerifier("x") });
    const server = twin.listen(0);
    await new Promise((r) => server.once("listening", r));
    const twinBase = `http://127.0.0.1:${server.address().port}`;
    try {
      const hit = (base) => fetch(`${base}/api/auth/refresh`, { method: "POST", headers: WEB }).then((r) => r.status);
      const statuses = [await hit(small.base), await hit(twinBase), await hit(small.base), await hit(twinBase), await hit(small.base), await hit(twinBase)];
      assert.deepEqual(statuses, [401, 401, 401, 401, 429, 429]);
      const row = await small.db.collection("auth_rate_limits").findOne({ _id: /^auth:/ });
      assert.equal(row.count, 6);
      assert.ok(row.expiresAt instanceof Date && row.expiresAt > new Date(), "the counter expires through the TTL index");
    } finally {
      await new Promise((r) => server.close(r));
      await small.stop();
    }
  });

  test("a counter starts again once its window has passed", async () => {
    const small = await startTestServer({ ECOSETU_AUTH_RATE_MAX: "2", ECOSETU_AUTH_RATE_WINDOW_MS: "300" });
    try {
      const hit = () => fetch(`${small.base}/api/auth/refresh`, { method: "POST", headers: WEB }).then((r) => r.status);
      assert.deepEqual([await hit(), await hit(), await hit()], [401, 401, 429]);
      await new Promise((r) => setTimeout(r, 350));
      assert.equal(await hit(), 401);
    } finally {
      await small.stop();
    }
  });

  test("on Vercel the limit is per X-Real-IP; elsewhere that header is ignored", async () => {
    // a Vercel deployment fails closed without a Blob store, so give it one
    const vercel = await startTestServer({ VERCEL: "1", BLOB_READ_WRITE_TOKEN: "test-blob-token", ECOSETU_AUTH_RATE_MAX: "2", ECOSETU_AUTH_RATE_WINDOW_MS: "60000" });
    const plain = await startTestServer({ ECOSETU_AUTH_RATE_MAX: "2", ECOSETU_AUTH_RATE_WINDOW_MS: "60000" });
    try {
      const hit = (base, ip) =>
        fetch(`${base}/api/auth/refresh`, { method: "POST", headers: { ...WEB, "x-real-ip": ip } }).then((r) => r.status);
      // Vercel: two different clients each get their own budget
      assert.deepEqual([await hit(vercel.base, "1.1.1.1"), await hit(vercel.base, "1.1.1.1"), await hit(vercel.base, "1.1.1.1")], [401, 401, 429]);
      assert.equal(await hit(vercel.base, "2.2.2.2"), 401);
      // not on Vercel: a made-up header can't buy a fresh budget
      assert.deepEqual([await hit(plain.base, "3.3.3.3"), await hit(plain.base, "4.4.4.4"), await hit(plain.base, "5.5.5.5")], [401, 401, 429]);
    } finally {
      await vercel.stop();
      await plain.stop();
    }
  });

  test("/api/auth routes are limited per IP", async () => {
    const small = await startTestServer({ ECOSETU_AUTH_RATE_MAX: "5", ECOSETU_AUTH_RATE_WINDOW_MS: "60000" });
    try {
      const hit = () => fetch(`${small.base}/api/auth/refresh`, { method: "POST", headers: WEB });
      const statuses = [];
      for (let i = 0; i < 7; i++) statuses.push((await hit()).status);
      assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429, 429]);
      assert.equal((await fetch(`${small.base}/api/locations`)).status, 200, "other routes are unaffected");
    } finally {
      await small.stop();
    }
  });
});

describe("locations (shared source of truth)", () => {
  test("public read returns the verified campus and clearly flagged demo data", async () => {
    const list = await listAll("/api/locations", "locations");
    const campus = list.find((l) => l.type === "campus");
    assert.ok(campus);
    assert.equal(campus.isDemo, false);
    assert.equal(campus.source, "verified");
    const demo = list.filter((l) => l.isDemo);
    assert.ok(demo.length >= 10);
    assert.ok(demo.every((l) => l.description.startsWith("DEMO")));
    for (const type of ["library", "hostel", "canteen", "main_gate"]) {
      assert.ok(list.some((l) => l.type === type), `missing type ${type}`);
    }
  });

  test("demo dustbins and public toilets are seeded, flagged DEMO", async () => {
    const list = (await listAll("/api/locations", "locations"));
    const bins = list.filter((l) => l.isDemo && l.type === "dustbin");
    const toilets = list.filter((l) => l.isDemo && l.type === "public_toilet");
    assert.ok(bins.length >= 6 && toilets.length >= 3);
    assert.ok([...bins, ...toilets].every((l) => l.source === "demo" && l.description.startsWith("DEMO")));
    assert.ok(bins.every((b) => b.statusSource === "simulated"));
    assert.ok(toilets.every((p) => !("statusSource" in p)));
  });

  test("a bin's status becomes manual once an official sets it, and stays manual", async () => {
    const official = await login("official");
    const made = (await call("POST", "/api/locations", { token: official, body: { ...BIN, name: "Src" } })).json.location;
    assert.equal(made.statusSource, "simulated");
    const set = (await call("PATCH", `/api/locations/${made.id}`, { token: official, body: { status: "overflow" } })).json.location;
    assert.equal(set.statusSource, "manual");
    const renamed = (await call("PATCH", `/api/locations/${made.id}`, { token: official, body: { name: "Src 2" } })).json.location;
    assert.equal(renamed.statusSource, "manual");
    const direct = (await call("POST", "/api/locations", { token: official, body: { ...BIN, name: "Src 3", status: "normal" } })).json.location;
    assert.equal(direct.statusSource, "manual");
  });

  test("markers are stored at the exact coordinates that were saved", async () => {
    const official = await login("official");
    const res = await call("POST", "/api/locations", {
      token: official,
      body: { ...BIN, name: "Exact", latitude: 29.8905551, longitude: 77.9601633 },
    });
    assert.equal(res.status, 201);
    const fetched = (await listAll("/api/locations", "locations")).find((l) => l.id === res.json.location.id);
    assert.equal(fetched.latitude, 29.8905551);
    assert.equal(fetched.longitude, 77.9601633);
  });

  test("filter by type and search by name", async () => {
    const hostels = (await listAll("/api/locations?type=hostel", "locations"));
    assert.ok(hostels.length > 0 && hostels.every((l) => l.type === "hostel"));
    const lib = (await listAll("/api/locations?q=library", "locations"));
    assert.ok(lib.some((l) => l.type === "library"));
    assert.equal((await call("GET", "/api/locations?type=spaceship")).status, 400);
  });

  test("citizens, workers and supervisors cannot create, edit or delete", async () => {
    const citizen = await login("citizen");
    const worker = await login("worker");
    const supervisor = await login("supervisor");
    const target = (await listAll("/api/locations?type=library", "locations"))[0];

    for (const token of [citizen, worker, supervisor]) {
      assert.equal((await call("POST", "/api/locations", { token, body: BIN })).status, 403);
      assert.equal((await call("PATCH", `/api/locations/${target.id}`, { token, body: { name: "Hacked" } })).status, 403);
      assert.equal((await call("DELETE", `/api/locations/${target.id}`, { token, body: {} })).status, 403);
    }
    assert.equal((await call("POST", "/api/locations", { body: BIN })).status, 401);
    assert.equal((await listAll("/api/locations?type=library", "locations")).find((l) => l.id === target.id).name, target.name);
  });

  test("an official-added facility is immediately visible to citizens", async () => {
    const official = await login("official");
    const created = await call("POST", "/api/locations", {
      token: official,
      body: { ...BIN, name: "Visible To Citizens" },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.location.source, "government");
    assert.equal(created.json.location.isDemo, false);
    const publicList = (await listAll("/api/locations", "locations"));
    assert.ok(publicList.some((l) => l.name === "Visible To Citizens"));
  });

  test("validation: coordinates, type, status and required fields", async () => {
    const official = await login("official");
    const bad = [
      [{ ...BIN, latitude: 91 }, "latitude"],
      [{ ...BIN, latitude: -91 }, "latitude"],
      [{ ...BIN, longitude: 181 }, "longitude"],
      [{ ...BIN, longitude: "abc" }, "longitude"],
      [{ ...BIN, latitude: null }, "latitude"],
      [{ ...BIN, name: "   " }, "name"],
      [{ ...BIN, type: "bakery" }, "type"],
      [{ ...BIN, type: "campus" }, "type"],
      [{ ...BIN, status: "exploded" }, "status"],
    ];
    for (const [body, field] of bad) {
      const res = await call("POST", "/api/locations", { token: official, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.json.fields[field], `expected error on ${field}`);
    }
    // boundary values are accepted
    const ok = await call("POST", "/api/locations", {
      token: official,
      body: { ...BIN, name: "Edge", latitude: -90, longitude: 180 },
    });
    assert.equal(ok.status, 201);
  });

  test("bins have a status and never a fill percentage", async () => {
    const official = await login("official");
    // default status; a percentage from an old client is dropped, not stored
    const made = await call("POST", "/api/locations", {
      token: official,
      body: { ...BIN, name: "Pct", details: { wasteType: "Wet Waste", fillLevel: 95, history: [1, 2] } },
    });
    assert.equal(made.status, 201);
    assert.equal(made.json.location.status, "normal");
    assert.deepEqual(made.json.location.details, { wasteType: "Wet Waste" });

    // editing something else keeps the status
    await call("PATCH", `/api/locations/${made.json.location.id}`, { token: official, body: { status: "almost_full" } });
    const renamed = await call("PATCH", `/api/locations/${made.json.location.id}`, { token: official, body: { name: "Pct 2" } });
    assert.equal(renamed.json.location.status, "almost_full");
  });

  test("bins saved by an older build are migrated to status only", async () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const legacy = (id, extra) => ({
      _id: id, name: id, type: "dustbin", latitude: 29.89, longitude: 77.96, description: "", address: "",
      source: "government", requestId: null, createdBy: "t", createdAt: ts, updatedAt: ts, isDemo: false,
      deletedAt: null, deletedBy: null, deleteReason: null, ...extra,
    });
    // written the way an older build did, before the collection had a validator
    await t.db.collection("locations").insertMany(
      [
        legacy("DB-901", { status: "normal", details: { wasteType: "Dry Waste", fillLevel: 96, history: [1, 2, 3] } }),
        legacy("DB-902", { details: { wasteType: "Wet Waste", fillLevel: 96 } }),
        legacy("DB-903", { status: "half", details: { wasteType: "Wet Waste", fillLevel: 75 } }),
      ],
      { bypassDocumentValidation: true }
    );
    assert.equal(await migrateLegacyBins(t.db), 3);
    const after = await t.db.collection("locations").find({ _id: { $in: ["DB-901", "DB-902", "DB-903"] } }).sort({ _id: 1 }).toArray();
    assert.deepEqual(after.map((d) => [d._id, d.status, d.details]), [
      ["DB-901", "normal", { wasteType: "Dry Waste" }], // an existing valid status wins
      ["DB-902", "overflow", { wasteType: "Wet Waste" }],
      ["DB-903", "almost_full", { wasteType: "Wet Waste" }],
    ]);
    assert.equal(await migrateLegacyBins(t.db), 0, "a second run changes nothing");
    await t.db.collection("locations").deleteMany({ _id: { $in: ["DB-901", "DB-902", "DB-903"] } });
  });

  test("input is sanitised (markup and control characters stripped)", async () => {
    const official = await login("official");
    const res = await call("POST", "/api/locations", {
      token: official,
      body: { ...BIN, name: "<script>alert(1)</script>Bin\u0000", address: "<b>x</b>" },
    });
    assert.equal(res.status, 201);
    assert.ok(!/[<>\u0000]/.test(res.json.location.name));
    assert.ok(!/[<>]/.test(res.json.location.address));
  });

  test("malformed JSON and unknown ids give clean errors", async () => {
    const official = await login("official");
    const bad = await call("POST", "/api/locations", { token: official, raw: "{not json" });
    assert.equal(bad.status, 400);
    assert.equal((await call("PATCH", "/api/locations/NOPE-1", { token: official, body: { name: "x" } })).status, 404);
    assert.equal((await call("DELETE", "/api/locations/NOPE-1", { token: official, body: {} })).status, 404);
    assert.equal((await call("GET", "/api/nope")).status, 404);
  });

  test("edit changes the stored data and bumps updatedAt", async () => {
    const official = await login("official");
    const { location } = (await call("POST", "/api/locations", { token: official, body: { ...BIN, name: "Before" } })).json;
    await new Promise((r) => setTimeout(r, 5));
    const res = await call("PATCH", `/api/locations/${location.id}`, {
      token: official,
      body: { name: "After", latitude: 29.8911, status: "overflow" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.location.name, "After");
    assert.equal(res.json.location.latitude, 29.8911);
    assert.equal(res.json.location.longitude, location.longitude);
    assert.equal(res.json.location.status, "overflow");
    assert.notEqual(res.json.location.updatedAt, location.updatedAt);
    const bad = await call("PATCH", `/api/locations/${location.id}`, { token: official, body: { latitude: 200 } });
    assert.equal(bad.status, 400);
    const wrongGroup = await call("PATCH", `/api/locations/${location.id}`, { token: official, body: { type: "library" } });
    assert.equal(wrongGroup.status, 400);
  });

  test("delete hides a location from citizens and can be restored", async () => {
    const official = await login("official");
    const { location } = (await call("POST", "/api/locations", { token: official, body: { ...BIN, name: "Temp" } })).json;
    const del = await call("DELETE", `/api/locations/${location.id}`, { token: official, body: { reason: "Duplicate entry" } });
    assert.equal(del.status, 200);
    assert.ok(!(await listAll("/api/locations", "locations")).some((l) => l.id === location.id));
    const removed = (await listAll("/api/locations/removed", "locations", official));
    const record = removed.find((l) => l.id === location.id);
    assert.equal(record.removalReason, "Duplicate entry");
    assert.equal((await call("DELETE", `/api/locations/${location.id}`, { token: official, body: {} })).status, 404);
    const back = await call("POST", `/api/locations/${location.id}/restore`, { token: official });
    assert.equal(back.status, 200);
    assert.ok((await listAll("/api/locations", "locations")).some((l) => l.id === location.id));
    assert.equal((await call("POST", `/api/locations/${location.id}/restore`, { token: official })).status, 404);
  });

  test("the verified campus reference is protected", async () => {
    const official = await login("official");
    const campus = (await listAll("/api/locations?type=campus", "locations"))[0];
    assert.equal((await call("PATCH", `/api/locations/${campus.id}`, { token: official, body: { name: "x" } })).status, 403);
    assert.equal((await call("DELETE", `/api/locations/${campus.id}`, { token: official, body: {} })).status, 403);
  });

  test("only officials can read the removed list", async () => {
    const worker = await login("worker");
    assert.equal((await call("GET", "/api/locations/removed", { token: worker })).status, 403);
    assert.equal((await call("GET", "/api/locations/removed")).status, 401);
  });
});

describe("worker request → official approval workflow", () => {
  test("worker submits, official approves, citizens see the facility", async () => {
    const worker = await login("worker", { workerId: "w1" });
    const official = await login("official");

    const created = await call("POST", "/api/facility-requests", { token: worker, body: { ...REQ, suggestedName: "Workflow Bin" } });
    assert.equal(created.status, 201);
    assert.equal(created.json.request.status, "PENDING");
    const id = created.json.request.id;

    assert.ok(!(await listAll("/api/locations", "locations")).some((l) => l.name === "Workflow Bin"));

    const mine = (await listAll("/api/facility-requests", "requests", worker));
    assert.ok(mine.some((r) => r.id === id));

    const approved = await call("PATCH", `/api/facility-requests/${id}/status`, { token: official, body: { status: "APPROVED" } });
    assert.equal(approved.status, 200);
    assert.equal(approved.json.request.status, "APPROVED");
    assert.equal(approved.json.location.source, "worker_approved");

    const visible = (await listAll("/api/locations", "locations")).find((l) => l.requestId === id);
    assert.ok(visible);
    assert.equal(visible.latitude, 29.8899);
    assert.equal(visible.type, "dustbin");

    // cannot be approved or rejected twice
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: official, body: { status: "APPROVED" } })).status, 409);
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: official, body: { status: "REJECTED", rejectionReason: "x y z" } })).status, 409);
    assert.equal((await listAll("/api/locations", "locations")).filter((l) => l.requestId === id).length, 1);
  });

  test("rejection needs a reason and creates no facility", async () => {
    const worker = await login("worker");
    const official = await login("official");
    const id = (await call("POST", "/api/facility-requests", { token: worker, body: { ...REQ, suggestedName: "Rejected Bin" } })).json.request.id;
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: official, body: { status: "REJECTED" } })).status, 400);
    const rej = await call("PATCH", `/api/facility-requests/${id}/status`, {
      token: official,
      body: { status: "REJECTED", rejectionReason: "Too close to an existing bin" },
    });
    assert.equal(rej.status, 200);
    assert.equal(rej.json.request.rejectionReason, "Too close to an existing bin");
    assert.ok(!(await listAll("/api/locations", "locations")).some((l) => l.name === "Rejected Bin"));
  });

  test("workers and citizens cannot approve; supervisors can only mark under review", async () => {
    const worker = await login("worker");
    const supervisor = await login("supervisor");
    const citizen = await login("citizen");
    const id = (await call("POST", "/api/facility-requests", { token: worker, body: { ...REQ, suggestedName: "Perm Bin" } })).json.request.id;

    for (const token of [worker, citizen]) {
      assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token, body: { status: "APPROVED" } })).status, 403);
    }
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: supervisor, body: { status: "APPROVED" } })).status, 403);
    const review = await call("PATCH", `/api/facility-requests/${id}/status`, { token: supervisor, body: { status: "UNDER_REVIEW" } });
    assert.equal(review.status, 200);
    assert.equal(review.json.request.status, "UNDER_REVIEW");
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { body: { status: "APPROVED" } })).status, 401);
    assert.equal((await call("PATCH", `/api/facility-requests/${id}/status`, { token: supervisor, body: { status: "BANANA" } })).status, 400);
  });

  test("citizens cannot create or list requests", async () => {
    const citizen = await login("citizen");
    assert.equal((await call("POST", "/api/facility-requests", { token: citizen, body: REQ })).status, 403);
    assert.equal((await call("GET", "/api/facility-requests", { token: citizen })).status, 403);
    assert.equal((await call("GET", "/api/facility-requests")).status, 401);
  });

  test("a worker only sees their own requests; officials see all", async () => {
    const a = await login("worker", { phone: "+919000000001", workerId: "w1" });
    const b = await login("worker", { phone: "+919000000002", workerId: "w2" });
    const official = await login("official");
    const idA = (await call("POST", "/api/facility-requests", { token: a, body: { ...REQ, suggestedName: "A's Bin" } })).json.request.id;
    const idB = (await call("POST", "/api/facility-requests", { token: b, body: { ...REQ, suggestedName: "B's Bin" } })).json.request.id;

    const aList = (await listAll("/api/facility-requests", "requests", a)).map((r) => r.id);
    assert.ok(aList.includes(idA) && !aList.includes(idB));
    // someone else's request looks exactly like one that doesn't exist
    const other = await call("GET", `/api/facility-requests/${idB}`, { token: a });
    const missing = await call("GET", "/api/facility-requests/FR-2026-999", { token: a });
    assert.equal(other.status, 404);
    assert.deepEqual(other.json, missing.json);
    assert.equal((await call("GET", `/api/facility-requests/${idA}`, { token: a })).status, 200);
    const all = (await listAll("/api/facility-requests", "requests", official)).map((r) => r.id);
    assert.ok(all.includes(idA) && all.includes(idB));
  });

  test("photos must be images under 1 MB; bodies over 4 MB are refused", async () => {
    const worker = await login("worker");
    const image = (bytes) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 7).toString("base64")}`;
    const ok = await call("POST", "/api/facility-requests", { token: worker, body: { ...REQ, suggestedName: "Photo ok", photo: image(MAX_PHOTO_BYTES) } });
    assert.equal(ok.status, 201, JSON.stringify(ok.json).slice(0, 200));
    const big = await call("POST", "/api/facility-requests", { token: worker, body: { ...REQ, photo: image(MAX_PHOTO_BYTES + 1) } });
    assert.equal(big.status, 400);
    assert.match(big.json.fields.photo, /1 MB/);
    const huge = await call("POST", "/api/facility-requests", { token: worker, body: { ...REQ, photo: image(3_200_000) } });
    assert.equal(huge.status, 413, "a 4.3 MB body is over the 4 MB limit");
  });

  test("request validation: coordinates, reason, photo, worker id", async () => {
    const worker = await login("worker");
    const cases = [
      [{ ...REQ, location: { ...REQ.location, latitude: 120 } }, "latitude"],
      [{ ...REQ, location: { ...REQ.location, longitude: -181 } }, "longitude"],
      [{ ...REQ, reason: "x" }, "reason"],
      [{ ...REQ, facilityType: "Fountain" }, "facilityType"],
      [{ ...REQ, photo: "data:text/html;base64,PHNjcmlwdD4=" }, "photo"],
      [{ ...REQ, requestedByWorkerId: "../etc" }, "requestedByWorkerId"],
      [{ ...REQ, priority: "URGENT" }, "priority"],
    ];
    for (const [body, field] of cases) {
      const res = await call("POST", "/api/facility-requests", { token: worker, body });
      assert.equal(res.status, 400, field);
      assert.ok(res.json.fields[field], field);
    }
  });

  test("seeded demo requests are present and publish nothing", async () => {
    const official = await login("official");
    const list = (await listAll("/api/facility-requests", "requests", official));
    assert.ok(list.some((r) => r.id === "FR-2026-001" && r.status === "PENDING"));
    assert.ok(list.some((r) => r.id === "FR-2026-003" && r.status === "REJECTED"));
    const locations = (await listAll("/api/locations", "locations"));
    assert.ok(!locations.some((l) => ["FR-2026-001", "FR-2026-003"].includes(l.requestId)));
  });
});

describe("login rate limiting", () => {
  test("repeated invalid Firebase tokens are throttled", async () => {
    let last;
    for (let i = 0; i < 32; i++) { // 30 failures per IP per 10 minutes
      last = await call("POST", "/api/auth/firebase-login", { body: { idToken: `bad-token-${i}` } });
    }
    assert.equal(last.status, 429);
  });
});
