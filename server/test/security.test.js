// Phase 5: security headers, CORS, write rate limits, request logging that
// never records secrets, production error responses, the cron secret, and the
// static site's headers.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seedAll } from "../src/seed.js";
import { apiClient, idToken, startTestServer } from "./helpers.js";
import { createLogger, redact } from "../src/logger.js";

const GENERAL = { issueType: "Dirty Area", description: "Rubbish near the gate", location: { address: "Gate", latitude: 29.8886, longitude: 77.959 } };

describe("security headers (helmet)", () => {
  let t;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.stop());

  test("every API response carries them, and says nothing about the server", async () => {
    const res = await fetch(`${t.base}/api/health`);
    const h = (name) => res.headers.get(name);
    assert.equal(h("x-content-type-options"), "nosniff");
    assert.equal(h("x-frame-options"), "DENY");
    assert.match(h("content-security-policy"), /default-src 'none'/);
    assert.match(h("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(h("referrer-policy"), "no-referrer");
    assert.match(h("strict-transport-security"), /max-age=\d+/);
    assert.equal(h("cross-origin-resource-policy"), "same-origin");
    assert.equal(h("x-powered-by"), null);
    assert.equal(h("cache-control"), "no-store");
  });
});

describe("CORS", () => {
  let t;
  before(async () => {
    t = await startTestServer({ ECOSETU_CORS_ORIGINS: "https://smart-swachh-bharat.vercel.app" });
  });
  after(() => t.stop());

  test("a request from a site that isn't allowed is refused", async () => {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const res = await fetch(`${t.base}/api/locations`, { method, headers: { Origin: "https://evil.example.com" } });
      assert.equal(res.status, 403, method);
      assert.equal(res.headers.get("access-control-allow-origin"), null);
    }
  });

  test("the allowed site gets the CORS headers, with credentials", async () => {
    const res = await fetch(`${t.base}/api/locations`, { headers: { Origin: "https://smart-swachh-bharat.vercel.app" } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://smart-swachh-bharat.vercel.app");
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  });

  test("same-origin requests (the app on Vercel) and requests without an Origin work", async () => {
    const host = new URL(t.base).host;
    assert.equal((await fetch(`${t.base}/api/locations`, { headers: { Origin: `http://${host}` } })).status, 200);
    assert.equal((await fetch(`${t.base}/api/locations`)).status, 200);
  });
});

describe("rate limit on writes", () => {
  test("too many writes from one IP get 429; reads are not counted", async () => {
    const t = await startTestServer({ ECOSETU_WRITE_RATE_MAX: "3", ECOSETU_WRITE_RATE_WINDOW_MS: "60000", ECOSETU_COMPLAINT_RATE_MAX: "100" });
    try {
      const api = apiClient(t);
      const c = await api.signIn("rl-writer");
      for (let i = 0; i < 5; i++) assert.equal((await api.call("GET", "/api/complaints", { token: c.token })).status, 200);
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push((await api.call("POST", "/api/complaints", { token: c.token, body: { ...GENERAL, description: `Write ${i}` } })).status);
      assert.deepEqual(statuses, [201, 201, 201, 429, 429]);
    } finally {
      await t.stop();
    }
  });
});

describe("request logging", () => {
  test("never records tokens, cookies, phone numbers, photo data or Blob tokens — even when an error is logged", async () => {
    const lines = [];
    const t = await startTestServer({}, { logger: (line) => lines.push(line) });
    try {
      await seedAll(t.repo, { demo: true });
      const api = apiClient(t);
      const c = await api.signIn("log-citizen");
      const SECRETS = {
        bearer: c.token,
        cookie: "ssb_refresh=refresh-cookie-value-9f8e7d",
        phone: "9876543210",
        photo: `data:image/jpeg;base64,${Buffer.alloc(300, 9).toString("base64")}`,
        blob: "vercel_blob_rw_SECRETBLOBTOKEN123",
        firebase: await idToken({ uid: "log-firebase" }),
      };

      await fetch(`${t.base}/api/complaints?phone=${SECRETS.phone}&token=${SECRETS.bearer}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRETS.bearer}`, Cookie: SECRETS.cookie, "x-blob-token": SECRETS.blob },
        body: JSON.stringify({ ...GENERAL, description: `Call ${SECRETS.phone}`, photo: SECRETS.photo }),
      });
      await fetch(`${t.base}/api/auth/firebase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: SECRETS.firebase }) });
      await fetch(`${t.base}/api/auth/refresh`, { method: "POST", headers: { Cookie: SECRETS.cookie, "x-ecosetu-client": "web" } });

      // an unexpected error whose message happens to contain secrets
      const real = t.repo.getLocation;
      t.repo.getLocation = async () => {
        throw new Error(`boom ${SECRETS.bearer} ${SECRETS.phone} ${SECRETS.photo} ${SECRETS.blob} ${SECRETS.cookie}`);
      };
      const failed = await fetch(`${t.base}/api/locations/DB-D01`, { headers: { Authorization: `Bearer ${SECRETS.bearer}` } });
      t.repo.getLocation = real;
      assert.equal(failed.status, 500);

      const log = lines.join("\n");
      assert.ok(lines.length >= 5, "requests were logged");
      assert.match(log, /"path":"\/api\/complaints"/, "the path is logged, without its query string");
      assert.match(log, /"status":500/);
      for (const [name, value] of Object.entries(SECRETS)) {
        assert.ok(!log.includes(value), `${name} appears in the log`);
      }
      assert.ok(!log.includes("refresh-cookie-value"), "cookie value");
      assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(log), "no JWT-looking string");
      assert.ok(!/\b\d{10}\b/.test(log), "no 10-digit number");
      assert.ok(!/data:image/.test(log), "no image data");
    } finally {
      await t.stop();
    }
  });
});

describe("location privacy", () => {
  test("redaction removes positions from any log text (a second line of defence)", () => {
    const out = redact('{"msg":"failed near 29.912345,77.987654 and -12.3456"}');
    assert.ok(!/\d+\.\d{4,}/.test(out), out);
    assert.equal((out.match(/\[coord\]/g) ?? []).length, 3);
    assert.match(redact('{"ms":12,"status":200}'), /"ms":12,"status":200/, "ordinary numbers stay");
  });

  test("a normal request or error log line is unchanged: status, time taken, ids and references stay", () => {
    const lines = [];
    const logger = createLogger((line) => lines.push(line));
    const request = { id: "a1b2c3d4", method: "GET", path: "/api/complaints/SSB2026-0045", status: 304, ms: 1234, role: "official" };
    logger.info(request);
    logger.error({ id: "9f8e7d6c", ref: "REF-4821-7730", errorType: "TypeError", status: 500, ms: 87 });
    const [info, error] = lines.map((l) => JSON.parse(l));
    assert.deepEqual({ ...info, t: undefined, level: undefined }, { ...request, t: undefined, level: undefined });
    assert.match(info.t, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "the timestamp keeps its milliseconds");
    assert.equal(error.ref, "REF-4821-7730");
    assert.equal(error.status, 500);
    assert.equal(error.ms, 87);
    assert.ok(!lines.join("").includes("[coord]") && !lines.join("").includes("[number]"), lines.join("\n"));
  });

  test("coordinates, addresses and search words never reach the request log, even in an error", async () => {
    const lines = [];
    const geoFetch = async (url) =>
      new URL(url).pathname === "/reverse" ? Response.json({ display_name: "7 Rose Lane, Roorkee" }) : Response.json([]);
    const t = await startTestServer({}, { logger: (line) => lines.push(line), geoFetch });
    try {
      await seedAll(t.repo, { demo: true });
      const api = apiClient(t);
      const c = await api.signIn("log-geo-citizen");
      const PRIVATE = {
        search: "Sharma Niwas Lane",
        lat: "29.912345",
        lon: "77.987654",
        address: "Flat 4B Rose Apartments",
        complaintLat: "29.88861",
        complaintLon: "77.95903",
      };
      await api.call("GET", `/api/geo/search?q=${encodeURIComponent(PRIVATE.search)}`, { token: c.token });
      await api.call("GET", `/api/geo/reverse?lat=${PRIVATE.lat}&lon=${PRIVATE.lon}`, { token: c.token });
      await api.call("GET", "/api/geo/reverse?lat=999.123456&lon=77.987654", { token: c.token }); // a 400
      await api.call("POST", "/api/complaints", {
        token: c.token,
        body: { ...GENERAL, location: { address: PRIVATE.address, latitude: Number(PRIVATE.complaintLat), longitude: Number(PRIVATE.complaintLon) } },
      });
      // an unexpected error whose message contains the position and the search words
      const real = t.repo.geocodeCacheGet;
      t.repo.geocodeCacheGet = async (key) => {
        throw new Error(`cache read failed for ${key} near ${PRIVATE.lat},${PRIVATE.lon}`);
      };
      const failed = await api.call("GET", `/api/geo/search?q=${encodeURIComponent(PRIVATE.search)}`, { token: c.token });
      t.repo.geocodeCacheGet = real;
      assert.equal(failed.status, 500);

      const log = lines.join("\n");
      assert.match(log, /"path":"\/api\/geo\/search"/);
      for (const [name, value] of Object.entries(PRIVATE)) {
        assert.ok(!log.toLowerCase().includes(value.toLowerCase()), `${name} appears in the log`);
      }
      assert.ok(!/\d{1,3}\.\d{4,}/.test(log), "no coordinate-looking number");
    } finally {
      await t.stop();
    }
  });

  test("the geocode cache stores no user id: only the lookup key, the answer and an expiry", async () => {
    const geoFetch = async (url) =>
      new URL(url).pathname === "/reverse"
        ? Response.json({ display_name: "7 Rose Lane, Roorkee" })
        : Response.json([{ display_name: "Roorkee", lat: "29.85", lon: "77.88", addresstype: "city" }]);
    const t = await startTestServer({}, { geoFetch });
    try {
      const api = apiClient(t);
      const c = await api.signIn("cache-owner-5d2e", { name: "Cache Owner" });
      await api.call("GET", "/api/geo/search?q=Roorkee", { token: c.token });
      await api.call("GET", "/api/geo/reverse?lat=29.9&lon=77.9", { token: c.token });
      const docs = await t.db.collection("geocode_cache").find({}).toArray();
      assert.equal(docs.length, 2);
      for (const doc of docs) {
        assert.deepEqual(Object.keys(doc).filter((k) => !["_id", "results", "address", "expiresAt"].includes(k)), []);
        assert.ok(!JSON.stringify(doc).includes("cache-owner-5d2e"), "user id");
        assert.ok(!JSON.stringify(doc).includes("Cache Owner"), "user name");
      }
    } finally {
      await t.stop();
    }
  });
});

describe("errors in production", () => {
  test("a 500 says only that something went wrong, with a reference — no stack, no details", async () => {
    const t = await startTestServer({ NODE_ENV: "production", BLOB_READ_WRITE_TOKEN: "test-blob-token" }, { logger: () => {} });
    try {
      t.repo.getLocation = async () => {
        throw new Error("Connection to cluster0.mongodb.net failed at /var/task/server/src/db.js:123");
      };
      const res = await fetch(`${t.base}/api/locations/DB-D01`);
      const body = await res.text();
      assert.equal(res.status, 500);
      assert.match(JSON.parse(body).error, /^Unexpected server error \(ref [0-9a-f]{8}\)\.$/);
      assert.ok(!/cluster0|db\.js|\bat\s/.test(body));
      assert.deepEqual(Object.keys(JSON.parse(body)), ["error"]);
    } finally {
      await t.stop();
    }
  });
});

describe("cron endpoint", () => {
  test("refuses anything but the exact CRON_SECRET", async () => {
    const t = await startTestServer({ CRON_SECRET: "the-right-cron-secret-123" });
    try {
      const call = (auth) => fetch(`${t.base}/api/cron/blob-deletions`, { headers: auth === undefined ? {} : { Authorization: auth } }).then((r) => r.status);
      for (const auth of [undefined, "", "Bearer", "Bearer the-right-cron-secret-12", "Bearer the-right-cron-secret-1234", "bearer the-right-cron-secret-123", "the-right-cron-secret-123", "Basic dGVzdA=="]) {
        assert.equal(await call(auth), 401, String(auth));
      }
      assert.equal(await call("Bearer the-right-cron-secret-123"), 200);
    } finally {
      await t.stop();
    }
  });

  test("doesn't exist at all without a CRON_SECRET", async () => {
    const t = await startTestServer();
    try {
      assert.equal((await fetch(`${t.base}/api/cron/blob-deletions`, { headers: { Authorization: "Bearer anything-at-all-12" } })).status, 404);
    } finally {
      await t.stop();
    }
  });
});

describe("the static site's headers (vercel.json)", () => {
  test("every page gets the security headers; geolocation and camera only for the site itself", () => {
    const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
    const all = config.headers.find((h) => h.source === "/(.*)");
    const headers = Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.match(headers["Permissions-Policy"], /geolocation=\(self\)/);
    assert.match(headers["Permissions-Policy"], /camera=\(self\)/);
    assert.match(headers["Permissions-Policy"], /microphone=\(\)/);
    assert.match(headers["Strict-Transport-Security"], /max-age=\d+/);
  });

  test("the CSP allows Firebase sign-in (anonymous, email) and nothing from the old phone sign-in", () => {
    const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
    const all = config.headers.find((h) => h.source === "/(.*)");
    const csp = all.headers.find((h) => /^Content-Security-Policy/.test(h.key)).value;
    const directive = (name) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "").split(/\s+/).slice(1);
    for (const host of ["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"]) {
      assert.ok(directive("connect-src").includes(host), host);
    }
    assert.doesNotMatch(csp, /recaptcha/i, "no reCAPTCHA (it was only for phone sign-in)");
    assert.doesNotMatch(csp, /www\.gstatic\.com|www\.google\.com|apis\.google\.com/, "no Google script, frame or image hosts");
    assert.deepEqual(directive("script-src"), ["'self'"]);
    assert.ok(!directive("frame-src").some((src) => /google|firebaseapp/.test(src)));
  });
});

describe("shared IPs (college Wi-Fi, a hackathon hall)", () => {
  test("20 signed-in users behind one IP each get their own write budget", async () => {
    const t = await startTestServer({ ECOSETU_WRITE_RATE_MAX: "3", ECOSETU_WRITE_RATE_WINDOW_MS: "60000", ECOSETU_AUTH_RATE_MAX: "1000", ECOSETU_COMPLAINT_RATE_MAX: "100" });
    try {
      const api = apiClient(t);
      const users = [];
      for (let i = 0; i < 20; i++) users.push(await api.signIn(`shared-ip-${i}`));
      // every one of them can submit normally (3 each), all from 127.0.0.1
      for (const [i, u] of users.entries()) {
        for (let n = 0; n < 3; n++) {
          const res = await api.call("POST", "/api/complaints", { token: u.token, body: { ...GENERAL, description: `User ${i} report ${n}` } });
          assert.equal(res.status, 201, `user ${i}, write ${n}`);
        }
      }
      // one user going over their own budget is limited, and only them
      assert.equal((await api.call("POST", "/api/complaints", { token: users[0].token, body: GENERAL })).status, 429);
      assert.equal((await api.call("POST", "/api/complaints", { token: (await api.signIn("shared-ip-late")).token, body: GENERAL })).status, 201);
      assert.ok(await t.db.collection("auth_rate_limits").findOne({ _id: "write:user:shared-ip-0" }), "counted per user id");
    } finally {
      await t.stop();
    }
  });

  test("20 people signing in from one IP are not blocked by the defaults", async () => {
    const t = await startTestServer({ ECOSETU_AUTH_RATE_MAX: "", ECOSETU_WRITE_RATE_MAX: "" });
    try {
      assert.equal(t.config.authRateLimit.max, 120, "sign-in: 120 per IP per minute");
      assert.equal(t.config.writeRateLimit.max, 60, "writes: 60 per signed-in user per minute");
      assert.equal(t.config.loginFailLimit.max, 30, "failed sign-ins: 30 per IP per 10 minutes");
      const api = apiClient(t);
      for (let i = 0; i < 20; i++) await api.signIn(`hall-${i}`); // throws on anything but 200
    } finally {
      await t.stop();
    }
  });

  test("refreshing a session is limited per session, not per IP", async () => {
    const t = await startTestServer({ ECOSETU_AUTH_RATE_MAX: "3", ECOSETU_AUTH_RATE_WINDOW_MS: "60000" });
    try {
      const api = apiClient(t);
      // the sign-ins themselves are per IP: 3 allowed
      const a = await api.signIn("refresh-a");
      const b = await api.signIn("refresh-b");
      let cookieA = a.cookie;
      for (let i = 0; i < 3; i++) {
        const res = await api.call("POST", "/api/auth/refresh", { cookie: cookieA });
        assert.equal(res.status, 200, `refresh ${i} for A`);
        cookieA = res.cookies.find((c) => c.startsWith("ssb_refresh=")).split(";")[0];
      }
      assert.equal((await api.call("POST", "/api/auth/refresh", { cookie: b.cookie })).status, 200, "B has their own budget");
    } finally {
      await t.stop();
    }
  });
});

describe("CORS on Vercel", () => {
  let t;
  before(async () => {
    t = await startTestServer({ VERCEL: "1", BLOB_READ_WRITE_TOKEN: "test-blob-token", ECOSETU_CORS_ORIGINS: "https://smart-swachh-bharat.vercel.app" });
  });
  after(() => t.stop());

  for (const host of ["smart-swachh-bharat.vercel.app", "smart-swachh-bharat-git-step-16-gauravdhanaliya.vercel.app", "smart-swachh-bharat-abc123xyz-gauravdhanaliya.vercel.app"]) {
    test(`the app on ${host} can call its own API (same origin), including writes`, async () => {
      const headers = { Origin: `https://${host}`, "X-Forwarded-Host": host, "X-Real-IP": "203.0.113.7" };
      assert.equal((await fetch(`${t.base}/api/locations`, { headers })).status, 200);
      const write = await fetch(`${t.base}/api/auth/refresh`, { method: "POST", headers: { ...headers, "x-ecosetu-client": "web" } });
      assert.equal(write.status, 401, "reaches the route (no cookie), not refused as cross-site");
    });
  }

  test("requests without an Origin header (same-origin GETs, curl, Vercel Cron) are not blocked", async () => {
    assert.equal((await fetch(`${t.base}/api/locations`, { headers: { "X-Real-IP": "203.0.113.8" } })).status, 200);
    assert.equal((await fetch(`${t.base}/api/health`)).status, 200);
  });

  test("a preview's origin calling the production API is cross-site, and refused", async () => {
    const res = await fetch(`${t.base}/api/locations`, {
      headers: { Origin: "https://smart-swachh-bharat-git-x-gauravdhanaliya.vercel.app", "X-Forwarded-Host": "smart-swachh-bharat.vercel.app" },
    });
    assert.equal(res.status, 403);
  });
});

describe("Content Security Policy for the site (report-only first)", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const headers = Object.fromEntries(config.headers.find((h) => h.source === "/(.*)").headers.map((h) => [h.key, h.value]));
  const csp = headers["Content-Security-Policy-Report-Only"] ?? "";
  const directive = (name) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "").split(/\s+/).slice(1);

  test("is sent as Report-Only, not enforced yet", () => {
    assert.ok(csp, "Content-Security-Policy-Report-Only is set");
    assert.equal(headers["Content-Security-Policy"], undefined);
  });

  test("allows what the app uses and nothing broader", () => {
    assert.deepEqual(directive("default-src"), ["'self'"]);
    assert.ok(directive("img-src").includes("https://*.tile.openstreetmap.org"), "map tiles");
    assert.ok(directive("img-src").includes("blob:"), "private photos are shown from blob: URLs");
    assert.ok(directive("frame-src").includes("https://www.openstreetmap.org"), "the OpenStreetMap embed");
    assert.ok(directive("style-src").includes("https://fonts.googleapis.com"));
    assert.ok(directive("font-src").includes("https://fonts.gstatic.com"));
    for (const host of ["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"]) {
      assert.ok(directive("connect-src").includes(host), `Firebase Auth: ${host}`);
    }
    // No phone sign-in, so no reCAPTCHA: scripts come only from the site itself.
    assert.deepEqual(directive("script-src"), ["'self'"]);
    // Nominatim: the browser-only build calls it directly (the API build goes through /api/geo).
    assert.ok(directive("connect-src").includes("https://nominatim.openstreetmap.org"), "Nominatim");
    assert.ok(!/overpass/.test(csp), "nothing calls Overpass any more, so it isn't allowed");
    assert.ok(directive("connect-src").includes("'self'"), "the API (same origin)");
    assert.deepEqual(directive("object-src"), ["'none'"]);
    assert.deepEqual(directive("frame-ancestors"), ["'none'"]);
    assert.ok(!/\*\s|'unsafe-eval'|https:\s|http:/.test(csp), "no wildcards on whole schemes, no eval, no plain http");
    assert.ok(!directive("script-src").includes("'unsafe-inline'"), "no inline scripts");
  });
});
