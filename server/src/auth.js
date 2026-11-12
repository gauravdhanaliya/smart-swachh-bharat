// Authentication, in two steps:
//
//   1. Firebase Phone Auth proves who the user is (the browser gets a Firebase
//      ID token; see firebase.js for how the server verifies it).
//   2. POST /api/auth/firebase-login swaps that token for this server's own
//      short-lived access JWT (+ a rotating refresh token in an httpOnly
//      cookie; see tokens.js). Every other route only ever sees the access JWT.
//
// What a user may do is the role stored for their uid in MongoDB. Clients can
// never pick a role: everyone starts as a citizen and an admin grants worker /
// government with `npm run grant-role`. Hiding a button in the UI grants nothing.

import crypto from "node:crypto";
import { ROLES } from "./constants.js";
import { verifyAccessToken } from "./tokens.js";

/**
 * Express middleware: attaches req.user when a valid access token is sent.
 * The token carries only { uid, role }; the rest of the profile is read from
 * the user's record. If the stored role has changed since the token was
 * issued, the token is rejected so the client refreshes and picks up the new one.
 */
export function authenticate({ config, repo }) {
  return async (req, _res, next) => {
    req.user = null;
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    if (match) {
      try {
        const claims = await verifyAccessToken(match[1], config.jwtSecret, config.tokenEnv);
        const user = claims ? await repo.getUserByUid(claims.uid) : null;
        // A token from before "sign out everywhere" (consent withdrawn) no longer counts.
        const revoked = user?.sessionsRevokedAt && claims.iat * 1000 <= Date.parse(user.sessionsRevokedAt);
        if (user && !revoked && user.role === claims.role && ROLES.includes(user.role)) {
          req.user = {
            uid: user.uid,
            role: user.role,
            name: user.name || user.role,
            phoneMasked: user.phoneMasked,
            isDemo: user.isDemo,
            ...(user.workerId ? { wid: user.workerId } : {}),
          };
        }
      } catch (err) {
        return next(err); // database trouble is a 500, not "signed out"
      }
    }
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

// ---- rate limiting ---------------------------------------------------
//
// Counters live in MongoDB (auth_rate_limits, expired by a TTL index), not in
// memory: on Vercel each warm instance has its own memory, so an in-memory
// limit would be multiplied by however many instances happen to be running.

/**
 * The caller's IP. On Vercel every request reaches Express from 127.0.0.1;
 * Vercel puts the real client address in X-Real-IP and overwrites any value
 * the caller sent (checked on a test deployment), so it can be trusted there.
 * Elsewhere the socket address is used and headers are ignored.
 */
export function clientIp(req, config) {
  if (config.behindVercel) {
    const real = req.headers["x-real-ip"];
    if (typeof real === "string" && real) return real.slice(0, 64);
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/** Failed-login counter (per IP): blocked() once `max` failures happen within the window. */
export function createLoginLimiter({ repo, config }) {
  const { max, windowMs } = config.loginFailLimit;
  const key = (ip) => `loginfail:${ip}`;
  return {
    async blocked(ip) {
      return (await repo.peekRateLimit(key(ip), windowMs)) >= max;
    },
    async fail(ip) {
      await repo.hitRateLimit(key(ip), windowMs);
    },
    async reset(ip) {
      await repo.clearRateLimit(key(ip));
    },
  };
}

/**
 * Who a request is counted against, most specific first: a signed-in user's
 * id, else the session behind a refresh cookie, else the IP. Counting
 * signed-in traffic per user matters on shared networks — a college or a
 * hackathon hall can put hundreds of people behind one public IP.
 */
export function rateLimitKey(req, config) {
  if (req.user?.uid) return `user:${req.user.uid}`;
  const cookie = readCookie(req, REFRESH_COOKIE);
  if (cookie) return `session:${crypto.createHash("sha256").update(cookie).digest("hex").slice(0, 24)}`;
  return `ip:${clientIp(req, config)}`;
}

/**
 * Fixed-window request limiter for a group of routes. `perIp` forces the IP
 * as the key (sign-in and demo login, where nobody is signed in yet).
 */
export function rateLimit({ max, windowMs, repo, config, name, perIp = false }) {
  return async (req, res, next) => {
    try {
      const who = perIp ? `ip:${clientIp(req, config)}` : rateLimitKey(req, config);
      const { count, resetAt } = await repo.hitRateLimit(`${name}:${who}`, windowMs);
      if (count > max) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))));
        return res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ---- refresh-token cookie ---------------------------------------------

export const REFRESH_COOKIE = "ssb_refresh";
const COOKIE_PATH = "/api/auth";

export function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}

export function isCrossSite(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    // Behind a proxy (Vite in development, nginx…) the site's host is the one
    // the browser used, which proxies pass along as X-Forwarded-Host.
    return new URL(origin).host !== (req.headers["x-forwarded-host"] ?? req.headers.host);
  } catch {
    return false;
  }
}

// Cross-site (frontend on another origin than the API) needs SameSite=None,
// which browsers only accept with Secure; same-site gets the stricter Strict.
function cookieAttrs(req, config, value, maxAge) {
  const cross = isCrossSite(req);
  const attrs = [
    `${REFRESH_COOKIE}=${value}`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    `Max-Age=${maxAge}`,
    cross ? "SameSite=None" : "SameSite=Strict",
  ];
  if (cross || config.production) attrs.push("Secure");
  return attrs.join("; ");
}

export function setRefreshCookie(req, res, config, token) {
  res.append("Set-Cookie", cookieAttrs(req, config, encodeURIComponent(token), config.refreshTtlSeconds));
}

export function clearRefreshCookie(req, res, config) {
  res.append("Set-Cookie", cookieAttrs(req, config, "", 0));
}

/**
 * CSRF guard for the cookie-authenticated routes (refresh, logout): the
 * request must carry a custom header (which a cross-site form can't send) and,
 * if it has an Origin, that origin must be this host or an allowed one.
 */
export function requireWebClient(config) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const originOk = !origin || !isCrossSite(req) || config.corsOrigins.includes(origin);
    if (req.headers["x-ecosetu-client"] !== "web" || !originOk) {
      return res.status(403).json({ error: "Request not allowed." });
    }
    next();
  };
}
