// Application JWTs, issued by this server after Firebase has verified the
// phone number. Two kinds, signed with two different secrets:
//
//   access  — 15 min, payload { sub: <user id>, role } only, sent as
//             "Authorization: Bearer"
//   refresh — 7 days, payload { sub, jti }, kept in an httpOnly cookie, stored
//             hashed in MongoDB, rotated on every use and revoked on logout.
//
// Built on `jose` (already used to verify Firebase tokens), HS256 only.
//
// The audience names the environment that issued the token — access
// "ecosetu-production" / "ecosetu-preview" / "ecosetu-development", refresh the
// same plus "-refresh" — and each environment accepts only its own. Different
// secrets per environment already keep a preview's tokens out of production;
// this still holds if a secret is ever shared by mistake.

import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "ecosetu-api";
export const TOKEN_ENVS = ["production", "preview", "development"];

function audienceFor(env, kind) {
  if (!TOKEN_ENVS.includes(env)) throw new Error(`Token environment must be one of ${TOKEN_ENVS.join(", ")} (got ${env}).`);
  return kind === "refresh" ? `ecosetu-${env}-refresh` : `ecosetu-${env}`;
}

const key = (secret) => new TextEncoder().encode(secret);

// `iat` keeps milliseconds (a JWT NumericDate may be fractional), so a token
// issued after a "sign out everywhere" is never mistaken for one from before it.
export async function signAccessToken({ uid, role }, secret, ttlSeconds, env) {
  const audience = audienceFor(env, "access");
  const iat = Date.now() / 1000;
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(uid)
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSeconds)
    .sign(key(secret));
}

export async function signRefreshToken({ uid }, secret, ttlSeconds, env) {
  const audience = audienceFor(env, "refresh");
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(uid)
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key(secret));
}

async function verify(token, secret, audience) {
  if (typeof token !== "string" || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience,
    });
    // `uid` is the user id the rest of the server reads; on the wire it is `sub`.
    return typeof payload.sub === "string" && payload.sub ? { ...payload, uid: payload.sub } : null;
  } catch {
    return null;
  }
}

/**
 * Returns the payload { sub, uid (= sub), role, … } or null for any invalid or
 * expired token, or one issued for another environment.
 */
export async function verifyAccessToken(token, secret, env) {
  const payload = await verify(token, secret, audienceFor(env, "access"));
  return payload && typeof payload.role === "string" ? payload : null;
}

export async function verifyRefreshToken(token, secret, env) {
  return verify(token, secret, audienceFor(env, "refresh"));
}

/** Refresh tokens are stored as SHA-256 hashes, never in the clear. */
export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
