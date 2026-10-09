// Runtime configuration, read from environment variables only.
// Secrets (JWT secret, role access codes) never live in source control —
// copy server/.env.example to .env and fill them in.

import crypto from "node:crypto";

const ROLE_CODE_ENV = {
  worker: "ECOSETU_CODE_WORKER",
  supervisor: "ECOSETU_CODE_SUPERVISOR",
  official: "ECOSETU_CODE_OFFICIAL",
  superadmin: "ECOSETU_CODE_SUPERADMIN",
};

// Development-only fallbacks so `npm run server` works out of the box.
// Refused outright when NODE_ENV=production.
const DEV_CODES = {
  worker: "worker-dev-code",
  supervisor: "supervisor-dev-code",
  official: "official-dev-code",
  superadmin: "superadmin-dev-code",
};

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const warnings = [];

  let jwtSecret = env.ECOSETU_JWT_SECRET;
  if (!jwtSecret) {
    if (production) throw new Error("ECOSETU_JWT_SECRET must be set in production.");
    jwtSecret = crypto.randomBytes(32).toString("hex");
    warnings.push("ECOSETU_JWT_SECRET not set — using a random secret (sessions reset on restart).");
  } else if (jwtSecret.length < 16) {
    throw new Error("ECOSETU_JWT_SECRET must be at least 16 characters.");
  }

  const accessCodes = {};
  for (const [role, name] of Object.entries(ROLE_CODE_ENV)) {
    let code = env[name];
    if (!code) {
      if (production) throw new Error(`${name} must be set in production.`);
      code = DEV_CODES[role];
      warnings.push(`${name} not set — using the development default for "${role}".`);
    }
    accessCodes[role] = code;
  }

  return {
    production,
    port: Number(env.PORT ?? env.ECOSETU_PORT ?? 4000),
    dbPath: env.ECOSETU_DB_PATH ?? "server/data/ecosetu.db",
    jwtSecret,
    accessCodes,
    tokenTtlSeconds: Number(env.ECOSETU_TOKEN_TTL_SECONDS ?? 60 * 60 * 12),
    corsOrigins: (env.ECOSETU_CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Staff roles must present their access code in production, or whenever
    // ECOSETU_REQUIRE_ACCESS_CODES=true. In local development it defaults to
    // off so the demo login is just mobile number + OTP.
    requireAccessCodes: production || env.ECOSETU_REQUIRE_ACCESS_CODES === "true",
    seedDemoData: env.ECOSETU_SEED_DEMO !== "false",
    warnings,
  };
}
