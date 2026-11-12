// The app's JWTs name the environment that issued them in their audience
// ("ecosetu-production", "ecosetu-preview", "ecosetu-development"), and each
// environment accepts only its own. Different secrets per environment are the
// first line (docs/DEPLOYMENT.md); this is the second, for when the same
// secret ends up in two environments by mistake.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt } from "jose";
import { loadConfig } from "../src/config.js";
import { hashToken, signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "../src/tokens.js";
import { TEST_ENV, apiClient, startTestServer } from "./helpers.js";

const USER = { uid: "aud-user-1", role: "citizen" };

describe("the token environment comes from VERCEL_ENV", () => {
  const envOf = (extra) => loadConfig({ ...TEST_ENV, MONGODB_URI: "mongodb://localhost:27017", ...extra }).tokenEnv;

  test("production, preview and development deployments", () => {
    assert.equal(envOf({ VERCEL_ENV: "production" }), "production");
    assert.equal(envOf({ VERCEL_ENV: "preview" }), "preview");
    assert.equal(envOf({ VERCEL_ENV: "development" }), "development");
  });

  test("locally (no VERCEL_ENV) it is development; NODE_ENV=production elsewhere is production", () => {
    assert.equal(envOf({}), "development");
    assert.equal(envOf({ VERCEL_ENV: "" }), "development");
    assert.equal(
      loadConfig({ ...TEST_ENV, NODE_ENV: "production", MONGODB_URI: "mongodb+srv://u:p@c.example.net/", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x", ECOSETU_JWT_SECRET: "a".repeat(40), ECOSETU_JWT_REFRESH_SECRET: "b".repeat(40), PHONE_HASH_SECRET: "c".repeat(40) }).tokenEnv,
      "production"
    );
  });

  test("an unknown VERCEL_ENV refuses to start rather than guess", () => {
    assert.throws(() => envOf({ VERCEL_ENV: "staging" }), /VERCEL_ENV/);
  });
});

describe("tokens carry and check their environment", () => {
  const SECRET = "x".repeat(40);

  test("an access token's audience names its environment", async () => {
    const token = await signAccessToken(USER, SECRET, 600, "preview");
    assert.equal(decodeJwt(token).aud, "ecosetu-preview");
    const refresh = await signRefreshToken(USER, SECRET, 600, "production");
    assert.equal(decodeJwt(refresh).aud, "ecosetu-production-refresh");
  });

  test("right secret, wrong environment: rejected", async () => {
    const preview = await signAccessToken(USER, SECRET, 600, "preview");
    assert.equal(await verifyAccessToken(preview, SECRET, "production"), null);
    assert.equal((await verifyAccessToken(preview, SECRET, "preview"))?.uid, USER.uid);
    const previewRefresh = await signRefreshToken(USER, SECRET, 600, "preview");
    assert.equal(await verifyRefreshToken(previewRefresh, SECRET, "production"), null);
    assert.equal((await verifyRefreshToken(previewRefresh, SECRET, "preview"))?.uid, USER.uid);
  });

  test("an access token can't be used as a refresh token, or the reverse, even with one secret", async () => {
    const access = await signAccessToken(USER, SECRET, 600, "production");
    const refresh = await signRefreshToken(USER, SECRET, 600, "production");
    assert.equal(await verifyRefreshToken(access, SECRET, "production"), null);
    assert.equal(await verifyAccessToken(refresh, SECRET, "production"), null);
  });

  test("tokens from before this change (audience ecosetu-access) are rejected", async () => {
    const { SignJWT } = await import("jose");
    const legacy = await new SignJWT({ role: "citizen" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER.uid)
      .setIssuer("ecosetu-api")
      .setAudience("ecosetu-access")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode(SECRET));
    assert.equal(await verifyAccessToken(legacy, SECRET, "production"), null);
  });

  test("signing or checking without an environment is a programming error, not a default", async () => {
    await assert.rejects(() => signAccessToken(USER, SECRET, 600), /environment/);
    await assert.rejects(() => verifyAccessToken("x.y.z", SECRET), /environment/);
    await assert.rejects(() => signRefreshToken(USER, SECRET, 600, "staging"), /environment/);
  });
});

describe("a production API with the preview audience's token", () => {
  let t;
  let api;
  let signedIn;
  before(async () => {
    t = await startTestServer({ VERCEL_ENV: "production" });
    api = apiClient(t);
    signedIn = await api.signIn(USER.uid);
  });
  after(() => t.stop());

  test("a token signed with the production secret but the preview audience is rejected", async () => {
    assert.equal(t.config.tokenEnv, "production");
    const own = await signAccessToken(USER, t.config.jwtSecret, 600, "production");
    assert.equal((await api.call("GET", "/api/auth/me", { token: own })).status, 200, "the same token for production works");
    const fromPreview = await signAccessToken(USER, t.config.jwtSecret, 600, "preview");
    assert.equal((await api.call("GET", "/api/auth/me", { token: fromPreview })).status, 401);
    assert.equal((await api.call("GET", "/api/complaints", { token: fromPreview })).status, 401);
  });

  test("a refresh cookie made for a preview is refused too, even if this database knew it", async () => {
    // Stored as if this server had issued it, so only the audience can refuse it.
    const store = async (token) =>
      t.repo.saveRefreshToken({ uid: USER.uid, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 600_000) });
    const previewRefresh = await signRefreshToken(USER, t.config.jwtRefreshSecret, 600, "preview");
    await store(previewRefresh);
    const res = await api.call("POST", "/api/auth/refresh", { cookie: `ssb_refresh=${previewRefresh}` });
    assert.equal(res.status, 401);

    const own = await signRefreshToken(USER, t.config.jwtRefreshSecret, 600, "production");
    await store(own);
    assert.equal((await api.call("POST", "/api/auth/refresh", { cookie: `ssb_refresh=${own}` })).status, 200, "the same for production works");
  });

  test("tokens the server issues itself carry its own environment", async () => {
    assert.equal(decodeJwt(signedIn.token).aud, "ecosetu-production");
    assert.equal((await api.call("GET", "/api/auth/me", { token: signedIn.token })).status, 200);
  });
});
