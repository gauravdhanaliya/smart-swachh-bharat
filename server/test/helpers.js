// Test stand-ins for the outside world:
//  - Google: a local RSA key pair signs "Firebase" ID tokens and a local JWKS
//    replaces Google's public keys, so the real verifier (signature, issuer,
//    audience, expiry) runs unchanged.
//  - MongoDB Atlas: an in-memory single-node replica set (transactions work).

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { loadConfig } from "../src/config.js";
import { connectDatabase, createRepository } from "../src/db.js";
import { createApp } from "../src/app.js";
import { createFirebaseVerifier } from "../src/firebase.js";
import { createMemoryPhotoStore } from "../src/photoStore.js";

export const PROJECT_ID = "ecosetu-test";

const good = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");

export const keys = createLocalJWKSet({
  keys: [{ ...(await exportJWK(good.publicKey)), kid: "test-key", alg: "RS256", use: "sig" }],
});

// A stable, unique-per-uid phone number (phone numbers are unique per account).
export const phoneFor = (uid) => `+91${(parseInt(crypto.createHash("sha1").update(uid).digest("hex").slice(0, 10), 16) % 9_000_000_000) + 1_000_000_000}`;

/** Signs a Firebase-shaped ID token. Override fields to forge bad ones. */
export function idToken({
  uid,
  phone = phoneFor(uid),
  projectId = PROJECT_ID,
  issuer = `https://securetoken.google.com/${projectId}`,
  audience = projectId,
  expiresIn = "1h",
  forged = false,
} = {}) {
  return new SignJWT({ phone_number: phone })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(uid)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(forged ? other.privateKey : good.privateKey);
}

export const TEST_ENV = {
  ECOSETU_FIREBASE_PROJECT_ID: PROJECT_ID,
  MONGODB_URI: "mongodb://placeholder", // replaced by the in-memory server's URI
  ECOSETU_JWT_SECRET: "test-access-secret-test-access-secret",
  ECOSETU_JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-secret",
  PHONE_HASH_SECRET: "test-phone-hash-secret-test-phone-hash",
  ECOSETU_AUTH_RATE_MAX: "100000", // rate limiting has its own test
  ECOSETU_WRITE_RATE_MAX: "100000",
};

/**
 * Runs an admin script (server/scripts/<name>.js) the way `npm run` does,
 * against the test database. Asynchronous on purpose: the in-memory mongod
 * logs to a pipe this process drains, so a blocking spawnSync would freeze
 * mongod as soon as the pipe filled up.
 */
export function runScript(t, script, args = [], env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [`server/scripts/${script}.js`, ...args],
      {
        env: { ...process.env, ...TEST_ENV, MONGODB_URI: t.config.mongoUri, MONGODB_DB_NAME: "ecosetu_test", ...env },
        encoding: "utf8",
        timeout: 60_000,
      },
      (err, stdout, stderr) => resolve({ status: err ? (err.code ?? 1) : 0, stdout, stderr, out: `${stdout}${stderr}` })
    );
  });
}

/**
 * Boots an in-memory MongoDB and a listening API against it. Photos go to an
 * in-memory stand-in for the private Blob store (`t.photos`); pass
 * `{ photos: null }` for a server with no photo storage.
 */
export async function startTestServer(envOverrides = {}, { photos = createMemoryPhotoStore(), logger = () => {}, geoFetch } = {}) {
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const config = loadConfig({ ...TEST_ENV, ...envOverrides, MONGODB_URI: mongod.getUri() });
  // If start-up fails, stop the in-memory MongoDB too, or the test run never exits.
  const connection = await connectDatabase({ uri: config.mongoUri, dbName: "ecosetu_test" }).catch(
    async (err) => {
      await mongod.stop();
      throw err;
    }
  );
  const repo = createRepository(connection.db, connection.client, null, { phoneHashSecret: config.phoneHashSecret });
  const app = createApp({ config, repo, photoStore: photos, logSink: logger, verifyFirebase: createFirebaseVerifier(PROJECT_ID, { keys }), geoFetch });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  return {
    config,
    repo,
    photos,
    db: connection.db,
    base: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      await new Promise((r) => server.close(r));
      await connection.close();
      await mongod.stop();
    },
  };
}

/**
 * A small HTTP client for one test server:
 *   call(method, path, { token, body, headers, cookie })
 *   signIn(uid, { role, workerId, name })  -> { token, user, cookie }
 *   listAll(path, key, token)              -> every item, following the pages
 * Roles other than citizen are granted in the database first, as in production.
 */
export function apiClient(t) {
  async function call(method, path, { token, body, headers = {}, cookie } = {}) {
    const res = await fetch(t.base + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { cookie, "x-ecosetu-client": "web" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      // no body
    }
    return { status: res.status, json, cookies: res.headers.getSetCookie?.() ?? [] };
  }

  async function signIn(uid, { role = "citizen", workerId = null, name } = {}) {
    const phone = phoneFor(uid);
    if (role !== "citizen") await t.repo.grantRole({ phone: phone.slice(-10), role, workerId });
    const res = await call("POST", "/api/auth/firebase", { body: { idToken: await idToken({ uid, phone }), ...(name ? { name } : {}) } });
    if (res.status !== 200) throw new Error(`sign-in failed for ${uid}: ${res.status} ${JSON.stringify(res.json)}`);
    const cookie = res.cookies.find((c) => c.startsWith("ssb_refresh="))?.split(";")[0] ?? "";
    return { token: res.json.accessToken, user: res.json.user, cookie };
  }

  async function listAll(path, key = "items", token) {
    const out = [];
    for (let page = 1; page < 100; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const res = await call("GET", `${path}${sep}page=${page}&limit=100`, { token });
      if (res.status !== 200) throw new Error(`GET ${path}: ${res.status} ${JSON.stringify(res.json)}`);
      out.push(...res.json[key]);
      if (!res.json.hasMore) return out;
    }
    throw new Error("too many pages");
  }

  return { call, signIn, listAll };
}
