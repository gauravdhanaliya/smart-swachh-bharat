// Test stand-ins for the outside world:
//  - Google: a local RSA key pair signs "Firebase" ID tokens and a local JWKS
//    replaces Google's public keys, so the real verifier (signature, issuer,
//    audience, expiry) runs unchanged.
//  - MongoDB Atlas: an in-memory single-node replica set (transactions work).

import crypto from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { loadConfig } from "../src/config.js";
import { connectDatabase, createRepository } from "../src/db.js";
import { createApp } from "../src/app.js";
import { createFirebaseVerifier } from "../src/firebase.js";

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
  ECOSETU_AUTH_RATE_MAX: "100000", // rate limiting has its own test
};

/** Boots an in-memory MongoDB and a listening API against it. */
export async function startTestServer(envOverrides = {}) {
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const config = loadConfig({ ...TEST_ENV, ...envOverrides, MONGODB_URI: mongod.getUri() });
  const connection = await connectDatabase({ uri: config.mongoUri, dbName: "ecosetu_test" });
  const repo = createRepository(connection.db, connection.client);
  const app = createApp({ config, repo, verifyFirebase: createFirebaseVerifier(PROJECT_ID, { keys }) });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  return {
    config,
    repo,
    db: connection.db,
    base: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      await new Promise((r) => server.close(r));
      await connection.close();
      await mongod.stop();
    },
  };
}
