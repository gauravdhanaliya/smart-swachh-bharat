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
        const claims = await verifyAccessToken(match[1], config.jwtSecret);
        const user = claims ? await repo.getUserByUid(claims.uid) : null;
        if (user && user.role === claims.role && ROLES.includes(user.role)) {
          req.user = {
            uid: user.uid,
            sub: `${user.role}:${user.phone}`,
            role: user.role,
            name: user.name || user.role,
            mobile: user.phone,
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

/** Fixed-window request limiter (per IP) for a group of routes. */
export function rateLimit({ max, windowMs }) {
  const windows = new Map();
  return (req, res, next) => {
    const ip = req.ip ?? "unknown";
    const t = Date.now();
    let w = windows.get(ip);
    if (!w || t - w.start > windowMs) {
      w = { start: t, count: 0 };
      windows.set(ip, w);
      if (windows.size > 10_000) for (const [k, v] of windows) if (t - v.start > windowMs) windows.delete(k);
    }
    w.count += 1;
    if (w.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((w.start + windowMs - t) / 1000)));
      return res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
    }
    next();
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

function isCrossSite(req) {
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
