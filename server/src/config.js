// Runtime configuration, read from environment variables only.
// Secrets (Mongo URI, JWT secrets) never live in source
// control — copy .env.example to .env and fill them in. Values are never
// logged.

import crypto from "node:crypto";

const MIN_SECRET_LENGTH = 32;

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const warnings = [];

  const firebaseProjectId = (env.ECOSETU_FIREBASE_PROJECT_ID ?? "").trim();
  if (!firebaseProjectId) {
    throw new Error("ECOSETU_FIREBASE_PROJECT_ID must be set (sign-in uses Firebase Phone Auth).");
  }

  const mongoUri = (env.MONGODB_URI ?? "").trim();
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set. Add your MongoDB Atlas connection string to .env.");
  }
  const mongoDbName = (env.MONGODB_DB_NAME ?? "").trim() || "ecosetu";

  const secret = (name) => {
    const value = env[name];
    if (value) {
      if (value.length < MIN_SECRET_LENGTH) {
        throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters.`);
      }
      return value;
    }
    if (production) throw new Error(`${name} must be set in production.`);
    warnings.push(`${name} not set — using a random secret (sessions reset on restart).`);
    return crypto.randomBytes(32).toString("hex");
  };
  const jwtSecret = secret("ECOSETU_JWT_SECRET");
  const jwtRefreshSecret = secret("ECOSETU_JWT_REFRESH_SECRET");
  if (jwtSecret === jwtRefreshSecret) {
    throw new Error("ECOSETU_JWT_SECRET and ECOSETU_JWT_REFRESH_SECRET must be different.");
  }

  return {
    production,
    port: Number(env.PORT ?? env.ECOSETU_PORT ?? 4000),
    mongoUri,
    mongoDbName,
    jwtSecret,
    jwtRefreshSecret,
    accessTtlSeconds: 15 * 60,
    refreshTtlSeconds: 7 * 24 * 60 * 60,
    corsOrigins: (env.ECOSETU_CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Firebase ID tokens are verified against this project (issuer + audience).
    firebaseProjectId,
    // Requests per window per IP across /api/auth/*.
    authRateLimit: {
      max: Number(env.ECOSETU_AUTH_RATE_MAX ?? 30),
      windowMs: Number(env.ECOSETU_AUTH_RATE_WINDOW_MS ?? 60_000),
    },
    seedDemoData: env.ECOSETU_SEED_DEMO !== "false",
    warnings,
  };
}
