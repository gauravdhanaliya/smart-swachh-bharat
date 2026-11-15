// Runtime configuration, read from environment variables only.
// Secrets (Mongo URI, JWT secrets, email-hash key) never live in source
// control — copy .env.example to .env and fill them in. Values are never
// logged.
//
// Production FAILS CLOSED: if a secret is missing or too short, loadConfig
// throws and the server does not start. "Production" means NODE_ENV=production
// or any Vercel deployment (VERCEL=1, set by Vercel itself), so a preview
// deploy with a forgotten variable can't quietly run on a default either.
// Only local development falls back to defaults, with a warning for each.

import crypto from "node:crypto";
import { DEFAULT_CONSENT_VERSION } from "./constants.js";
import { TOKEN_ENVS } from "./tokens.js";
import { MIN_IDENTITY_SECRET_LENGTH } from "./identity.js";

const MIN_SECRET_LENGTH = 32;

// Development only. Email hashes must stay the same across restarts (they are
// how a saved account is found when an official grants it a role), so unlike
// the JWT secrets this fallback is fixed rather than random.
const DEV_IDENTITY_HASH_SECRET = "ecosetu-development-only-phone-hash-secret";

const MONGO_URI = /^mongodb(\+srv)?:\/\/[^/\s]+/;

// A number from the environment; unset or empty means the default.
const num = (raw, fallback) => (raw === undefined || raw === "" ? fallback : Number(raw));

function consentVersion(raw) {
  if (raw === undefined || raw === "") return DEFAULT_CONSENT_VERSION;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error("ECOSETU_CONSENT_VERSION must be a whole number of 1 or more.");
  return n;
}

// Which environment issues and accepts this server's tokens (their audience,
// see tokens.js): Vercel's own VERCEL_ENV; elsewhere production when
// NODE_ENV=production, otherwise development.
function tokenEnvironment(env) {
  const vercelEnv = (env.VERCEL_ENV ?? "").trim();
  if (vercelEnv) {
    if (!TOKEN_ENVS.includes(vercelEnv)) throw new Error(`VERCEL_ENV must be one of ${TOKEN_ENVS.join(", ")} (got "${vercelEnv}").`);
    return vercelEnv;
  }
  return env.NODE_ENV === "production" ? "production" : "development";
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production" || env.VERCEL === "1";
  const tokenEnv = tokenEnvironment(env);
  const warnings = [];

  const firebaseProjectId = (env.ECOSETU_FIREBASE_PROJECT_ID ?? "").trim();
  if (!firebaseProjectId) {
    throw new Error("ECOSETU_FIREBASE_PROJECT_ID must be set (sign-in uses Firebase Authentication).");
  }

  const mongoUri = (env.MONGODB_URI ?? "").trim();
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set. Add your MongoDB Atlas connection string to .env.");
  }
  if (!MONGO_URI.test(mongoUri)) {
    throw new Error("MONGODB_URI isn't a MongoDB connection string (it should start with mongodb:// or mongodb+srv:// and name a host).");
  }
  const mongoDbName = (env.MONGODB_DB_NAME ?? "").trim() || "ecosetu";

  // `names` are accepted spellings, first one preferred in messages.
  const secret = (names, { minLength = MIN_SECRET_LENGTH, devFallback } = {}) => {
    const name = names.find((n) => env[n]) ?? names[0];
    const value = env[name] ?? "";
    const label = names.join(" / ");
    if (value) {
      if (value.length < minLength) throw new Error(`${name} must be at least ${minLength} characters.`);
      return value;
    }
    if (production) throw new Error(`${label} must be set in production (at least ${minLength} characters).`);
    warnings.push(`${label} not set — using a development value. Never use it with real users.`);
    return devFallback ?? crypto.randomBytes(32).toString("hex");
  };

  const jwtSecret = secret(["ECOSETU_JWT_SECRET", "JWT_ACCESS_SECRET"]);
  const jwtRefreshSecret = secret(["ECOSETU_JWT_REFRESH_SECRET", "JWT_REFRESH_SECRET"]);
  // Keys the email hash of saved accounts. The variable kept the name it had
  // when sign-in was by phone, so existing deployments need no change.
  const identityHashSecret = secret(["PHONE_HASH_SECRET"], {
    minLength: MIN_IDENTITY_SECRET_LENGTH,
    devFallback: DEV_IDENTITY_HASH_SECRET,
  });
  if (new Set([jwtSecret, jwtRefreshSecret, identityHashSecret]).size !== 3) {
    throw new Error("The access-token, refresh-token and PHONE_HASH_SECRET secrets must all be different.");
  }

  // Photos: a PRIVATE Vercel Blob store. On Vercel, connecting the store to
  // the project provides BLOB_STORE_ID (+ short-lived OIDC credentials) and,
  // if ticked, BLOB_READ_WRITE_TOKEN; elsewhere set BLOB_READ_WRITE_TOKEN.
  // ECOSETU_BLOB_FAKE_DIR swaps in a local folder for tests and never runs in
  // production. Production without a store fails closed.
  let photoStorage;
  if (env.ECOSETU_BLOB_FAKE_DIR) {
    if (production) throw new Error("ECOSETU_BLOB_FAKE_DIR is for tests only and can't be used in production.");
    photoStorage = { kind: "folder", dir: env.ECOSETU_BLOB_FAKE_DIR };
  } else if (env.BLOB_READ_WRITE_TOKEN) {
    photoStorage = { kind: "vercel-blob", token: env.BLOB_READ_WRITE_TOKEN };
  } else if (env.VERCEL === "1" && env.BLOB_STORE_ID) {
    photoStorage = { kind: "vercel-blob", token: null };
  } else {
    if (production) {
      throw new Error("Photo storage is not configured: connect a PRIVATE Vercel Blob store (BLOB_READ_WRITE_TOKEN) in production.");
    }
    warnings.push("No Blob store configured (BLOB_READ_WRITE_TOKEN) — reports with photos will be refused.");
    photoStorage = { kind: "none" };
  }

  const cronSecret = env.CRON_SECRET ?? "";
  if (cronSecret && cronSecret.length < 16) throw new Error("CRON_SECRET must be at least 16 characters.");

  const mapLimit = Number(env.ECOSETU_MAP_LIMIT ?? 2000);
  if (!Number.isInteger(mapLimit) || mapLimit < 1 || mapLimit > 2000) throw new Error("ECOSETU_MAP_LIMIT must be a whole number from 1 to 2000.");

  return {
    production,
    port: Number(env.PORT ?? env.ECOSETU_PORT ?? 4000),
    photoStorage,
    // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; without it the cron route doesn't exist.
    cronSecret: cronSecret || null,
    // GET /api/locations/map returns at most this many facilities.
    mapLimit,
    mongoUri,
    mongoDbName,
    jwtSecret,
    jwtRefreshSecret,
    identityHashSecret,
    tokenEnv,
    accessTtlSeconds: 15 * 60,
    refreshTtlSeconds: 7 * 24 * 60 * 60,
    corsOrigins: (env.ECOSETU_CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Firebase ID tokens are verified against this project (issuer + audience).
    firebaseProjectId,
    // /api/auth/*. Signing in (no session yet) is counted per IP — generous,
    // because a whole college or hackathon hall can share one public IP.
    // Refresh/logout are counted per session (the refresh cookie).
    authRateLimit: {
      max: num(env.ECOSETU_AUTH_RATE_MAX, 120),
      windowMs: num(env.ECOSETU_AUTH_RATE_WINDOW_MS, 60_000),
    },
    // Writes (POST/PUT/PATCH/DELETE) outside /api/auth, per signed-in user
    // (per IP only for requests with no valid sign-in, which are refused anyway).
    writeRateLimit: {
      max: num(env.ECOSETU_WRITE_RATE_MAX, 60),
      windowMs: num(env.ECOSETU_WRITE_RATE_WINDOW_MS, 60_000),
    },
    // Failed Firebase logins per IP before /api/auth/firebase answers 429.
    loginFailLimit: {
      max: num(env.ECOSETU_LOGIN_FAIL_MAX, 30),
      windowMs: num(env.ECOSETU_LOGIN_FAIL_WINDOW_MS, 10 * 60_000),
    },
    // POST /api/auth/demo: off unless explicitly switched on, and limited on
    // its own (stricter than the rest of /api/auth).
    demoLoginEnabled: env.DEMO_LOGIN_ENABLED === "true",
    demoRateLimit: {
      max: num(env.ECOSETU_DEMO_RATE_MAX, 60),
      windowMs: num(env.ECOSETU_DEMO_RATE_WINDOW_MS, 60_000),
    },
    // New complaints per user (not per IP) per window.
    complaintRateLimit: {
      max: num(env.ECOSETU_COMPLAINT_RATE_MAX, 10),
      windowMs: num(env.ECOSETU_COMPLAINT_RATE_WINDOW_MS, 60 * 60_000),
    },
    // ...and per IP, since a new account costs little. Sized for a
    // campus or hackathon hall behind one public IP, not for one person.
    complaintIpRateLimit: {
      max: num(env.ECOSETU_COMPLAINT_IP_RATE_MAX, 30),
      windowMs: num(env.ECOSETU_COMPLAINT_RATE_WINDOW_MS, 60 * 60_000),
    },
    // Sign-ups per IP: an email account's first sign-in. Returning accounts
    // are never counted. Sized for a campus behind one public IP.
    signupRateLimit: {
      max: num(env.ECOSETU_SIGNUP_RATE_MAX, 20),
      windowMs: num(env.ECOSETU_SIGNUP_RATE_WINDOW_MS, 60 * 60_000),
    },
    // Toilet ratings (each user has one per toilet; changing it counts too).
    ratingRateLimit: {
      max: num(env.ECOSETU_RATING_RATE_MAX, 20),
      windowMs: num(env.ECOSETU_RATING_RATE_WINDOW_MS, 60 * 60_000),
    },
    ratingIpRateLimit: {
      max: num(env.ECOSETU_RATING_IP_RATE_MAX, 60),
      windowMs: num(env.ECOSETU_RATING_RATE_WINDOW_MS, 60 * 60_000),
    },
    // Up/down votes on complaints (setting, changing or removing one).
    voteRateLimit: {
      max: num(env.ECOSETU_VOTE_RATE_MAX, 60),
      windowMs: num(env.ECOSETU_VOTE_RATE_WINDOW_MS, 60 * 60_000),
    },
    voteIpRateLimit: {
      max: num(env.ECOSETU_VOTE_IP_RATE_MAX, 200),
      windowMs: num(env.ECOSETU_VOTE_RATE_WINDOW_MS, 60 * 60_000),
    },
    // Place search / street-address lookups (OpenStreetMap Nominatim), per
    // signed-in user. Nominatim itself is called at most once a second for
    // the whole app (geocode.js).
    geoRateLimit: {
      max: num(env.ECOSETU_GEO_RATE_MAX, 30),
      windowMs: num(env.ECOSETU_GEO_RATE_WINDOW_MS, 60_000),
    },
    // Nominatim's policy: identify the application. Browsers can't set a
    // User-Agent, which is one reason the API makes these calls.
    geocodeUserAgent: (env.ECOSETU_GEOCODE_USER_AGENT ?? "").trim() || "EcoSetu/1.0 (+https://smart-swachh-bharat.vercel.app)",
    // The privacy-notice version users must have accepted. Raise it when the
    // notice changes and everyone is asked again.
    consentVersion: consentVersion(env.ECOSETU_CONSENT_VERSION),
    // On Vercel every request reaches Express from 127.0.0.1; the real client
    // address is in X-Real-IP, which Vercel sets itself and a caller can't
    // override (checked on a test deployment).
    behindVercel: env.VERCEL === "1",
    seedDemoData: env.ECOSETU_SEED_DEMO !== "false",
    warnings,
  };
}
