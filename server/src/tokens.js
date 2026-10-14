// Application JWTs, issued by this server after Firebase has verified the
// phone number. Two kinds, signed with two different secrets:
//
//   access  — 15 min, payload { uid, role } only, sent as "Authorization: Bearer"
//   refresh — 7 days, payload { uid, jti }, kept in an httpOnly cookie, stored
//             hashed in MongoDB, rotated on every use and revoked on logout.
//
// Built on `jose` (already used to verify Firebase tokens), HS256 only.

import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "ecosetu-api";
const ACCESS_AUDIENCE = "ecosetu-access";
const REFRESH_AUDIENCE = "ecosetu-refresh";

const key = (secret) => new TextEncoder().encode(secret);

export function signAccessToken({ uid, role }, secret, ttlSeconds) {
  return new SignJWT({ uid, role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(ACCESS_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key(secret));
}

export function signRefreshToken({ uid }, secret, ttlSeconds) {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(REFRESH_AUDIENCE)
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
    return typeof payload.uid === "string" && payload.uid ? payload : null;
  } catch {
    return null;
  }
}

/** Returns the payload { uid, role, … } or null for any invalid/expired token. */
export async function verifyAccessToken(token, secret) {
  const payload = await verify(token, secret, ACCESS_AUDIENCE);
  return payload && typeof payload.role === "string" ? payload : null;
}

export function verifyRefreshToken(token, secret) {
  return verify(token, secret, REFRESH_AUDIENCE);
}

/** Refresh tokens are stored as SHA-256 hashes, never in the clear. */
export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
