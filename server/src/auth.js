// Minimal signed-token auth (HMAC-SHA256, JWT-shaped) using only node:crypto.
//
// How roles are protected: citizens need no secret, but every privileged
// role (worker, supervisor, official, superadmin) must present that
// role's access code, which lives in the server environment. The code is
// checked here, on the server — hiding a button in the UI grants nothing.
// The role inside the token is signed, so it can't be edited client-side.

import crypto from "node:crypto";
import { ROLES } from "./constants.js";

const b64 = (buf) => Buffer.from(buf).toString("base64url");

export function signToken(payload, secret, ttlSeconds) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const data = `${head}.${b64(JSON.stringify(body))}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try {
    given = Buffer.from(parts[2], "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!ROLES.includes(payload.role)) return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Constant-time comparison that doesn't leak the code length.
export function codesMatch(given, expected) {
  const a = crypto.createHash("sha256").update(String(given ?? "")).digest();
  const b = crypto.createHash("sha256").update(String(expected ?? "")).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Express middleware: attaches req.user when a valid Bearer token is sent. */
export function authenticate(config) {
  return (req, _res, next) => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    req.user = match ? verifyToken(match[1], config.jwtSecret) : null;
    next();
  };
}

/** Express middleware factory: 401 without a login, 403 for the wrong role. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Sign in required." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Your role isn't allowed to do this." });
    }
    next();
  };
}

// Simple in-memory limiter for failed logins (per IP).
export function createLoginLimiter({ max = 10, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();
  return {
    blocked(ip) {
      const entry = hits.get(ip);
      if (!entry) return false;
      if (Date.now() - entry.first > windowMs) {
        hits.delete(ip);
        return false;
      }
      return entry.count >= max;
    },
    fail(ip) {
      const entry = hits.get(ip);
      if (!entry || Date.now() - entry.first > windowMs) hits.set(ip, { first: Date.now(), count: 1 });
      else entry.count += 1;
    },
    reset(ip) {
      hits.delete(ip);
    },
  };
}
