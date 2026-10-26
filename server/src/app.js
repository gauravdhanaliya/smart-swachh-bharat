// EcoSetu API.
//
//   GET    /api/health
//   POST   /api/auth/firebase-login        { idToken, name? }   (role comes from the database)
//            -> { accessToken, expiresIn, user } + refresh token in an httpOnly cookie
//   POST   /api/auth/refresh               (refresh cookie) -> new accessToken, rotated cookie
//   POST   /api/auth/logout                (refresh cookie) revokes it
//   GET    /api/auth/me                    current user
//
// Every route that needs a user takes "Authorization: Bearer <access token>".
//   GET    /api/locations                  public — ?type=&q=
//   GET    /api/locations/removed          official, superadmin
//   POST   /api/locations                  official, superadmin
//   PATCH  /api/locations/:id              official, superadmin
//   DELETE /api/locations/:id              official, superadmin   { reason }
//   POST   /api/locations/:id/restore      official, superadmin
//   GET    /api/facility-requests          worker (own) · supervisor/official/superadmin (all)
//   GET    /api/facility-requests/:id      same visibility
//   POST   /api/facility-requests          worker, supervisor
//   PATCH  /api/facility-requests/:id/status  { status, rejectionReason? }
//            APPROVED/REJECTED: official, superadmin · UNDER_REVIEW: + supervisor

import express from "express";
import crypto from "node:crypto";
import {
  ADMIN_ROLES,
  ROLES,
  LOCATION_TYPES,
  REQUEST_STATUS,
} from "./constants.js";
import {
  REFRESH_COOKIE,
  authenticate,
  clearRefreshCookie,
  createLoginLimiter,
  rateLimit,
  readCookie,
  requireRole,
  requireWebClient,
  setRefreshCookie,
} from "./auth.js";
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from "./tokens.js";
import {
  ValidationError,
  cleanText,
  validateFirebaseLogin,
  validateLocation,
  validateRequest,
} from "./validate.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp({ config, repo, verifyFirebase }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-EcoSetu-Client");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: "6mb" }));
  app.use(authenticate({ config, repo }));

  const loginLimiter = createLoginLimiter();

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // ---- auth --------------------------------------------------------

  // Every /api/auth route shares one request budget per IP.
  app.use("/api/auth", rateLimit(config.authRateLimit));

  const publicUser = (u) => ({
    uid: u.uid,
    sub: `${u.role}:${u.phone}`,
    role: u.role,
    name: u.name,
    mobile: u.phone,
    ...(u.workerId ? { wid: u.workerId } : {}),
  });

  // Issues a fresh access token + a rotated refresh token (httpOnly cookie).
  const startSession = async (req, res, user) => {
    const accessToken = await signAccessToken(user, config.jwtSecret, config.accessTtlSeconds);
    const refreshToken = await signRefreshToken(user, config.jwtRefreshSecret, config.refreshTtlSeconds);
    await repo.saveRefreshToken({
      uid: user.uid,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + config.refreshTtlSeconds * 1000),
    });
    setRefreshCookie(req, res, config, refreshToken);
    return { accessToken, expiresIn: config.accessTtlSeconds, user: publicUser(user) };
  };

  // Firebase has already verified the phone number in the browser; this
  // finds or creates the user for that Firebase uid and starts the app
  // session. The role is whatever the database holds (a first-time user is a
  // citizen unless an admin pre-granted a role to their phone number) — any
  // role the client sends is ignored.
  app.post("/api/auth/firebase-login", wrap(async (req, res) => {
    const ip = req.ip ?? "unknown";
    if (loginLimiter.blocked(ip)) {
      return res.status(429).json({ error: "Too many failed attempts. Try again later." });
    }
    const body = validateFirebaseLogin(req.body);

    // The phone number comes from the verified ID token — never from the body.
    let verified;
    try {
      verified = await verifyFirebase(body.idToken);
    } catch {
      loginLimiter.fail(ip);
      return res.status(401).json({ error: "Phone verification failed. Please sign in again." });
    }
    const mobile = verified.phone.replace(/\D/g, "").slice(-10);
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ error: "This account has no verified mobile number." });
    }
    loginLimiter.reset(ip);

    let user;
    try {
      user = await repo.upsertUser({ uid: verified.uid, phone: mobile, name: body.name });
    } catch (err) {
      if (err.code === "phone_taken") {
        return res.status(409).json({ error: "This mobile number is already linked to another account." });
      }
      throw err;
    }
    res.json(await startSession(req, res, user));
  }));

  // Swaps the refresh cookie for a new access token. Each refresh token works
  // once; reusing an old one revokes the user's other refresh tokens too
  // (possible theft).
  app.post("/api/auth/refresh", requireWebClient(config), wrap(async (req, res) => {
    const fail = () => {
      clearRefreshCookie(req, res, config);
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    };
    const token = readCookie(req, REFRESH_COOKIE);
    const claims = token ? await verifyRefreshToken(token, config.jwtRefreshSecret) : null;
    if (!claims) return fail();
    const uid = await repo.consumeRefreshToken(hashToken(token));
    if (!uid || uid !== claims.uid) return fail();
    const user = await repo.getUserByUid(uid);
    if (!user) return fail();
    res.json(await startSession(req, res, user));
  }));

  app.post("/api/auth/logout", requireWebClient(config), wrap(async (req, res) => {
    const token = readCookie(req, REFRESH_COOKIE);
    if (token) await repo.revokeRefreshToken(hashToken(token));
    clearRefreshCookie(req, res, config);
    res.json({ ok: true });
  }));

  app.get("/api/auth/me", requireRole(...ROLES), (req, res) => {
    res.json({ user: publicUser({ ...req.user, phone: req.user.mobile, workerId: req.user.wid }) });
  });

  // ---- locations ---------------------------------------------------

  app.get("/api/locations", wrap(async (req, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    if (type && !LOCATION_TYPES.includes(type)) {
      return res.status(400).json({ error: "Unknown location type." });
    }
    const q = typeof req.query.q === "string" ? cleanText(req.query.q, 80) : undefined;
    res.json({ locations: await repo.listLocations({ type, q }) });
  }));

  app.get("/api/locations/removed", requireRole(...ADMIN_ROLES), wrap(async (_req, res) => {
    res.json({ locations: await repo.listRemoved() });
  }));

  app.post(
    "/api/locations",
    requireRole(...ADMIN_ROLES),
    wrap(async (req, res) => {
      const data = validateLocation(req.body);
      const created = await repo.createLocation(data, req.user.name || req.user.sub);
      res.status(201).json({ location: created });
    })
  );

  app.patch(
    "/api/locations/:id",
    requireRole(...ADMIN_ROLES),
    wrap(async (req, res) => {
      const existing = await repo.getLocation(req.params.id);
      if (!existing) return res.status(404).json({ error: "Location not found." });
      if (existing.type === "campus") {
        return res.status(403).json({ error: "The verified campus reference can't be edited." });
      }
      const data = validateLocation(req.body, { existing });
      res.json({ location: await repo.updateLocation(req.params.id, data) });
    })
  );

  app.delete(
    "/api/locations/:id",
    requireRole(...ADMIN_ROLES),
    wrap(async (req, res) => {
      const existing = await repo.getLocation(req.params.id);
      if (!existing) return res.status(404).json({ error: "Location not found." });
      if (existing.type === "campus") {
        return res.status(403).json({ error: "The verified campus reference can't be removed." });
      }
      const reason = cleanText(req.body?.reason ?? "", 200) || "No reason recorded";
      await repo.softDelete(req.params.id, req.user.name || req.user.sub, reason);
      res.json({ ok: true, id: req.params.id });
    })
  );

  app.post(
    "/api/locations/:id/restore",
    requireRole(...ADMIN_ROLES),
    wrap(async (req, res) => {
      const restored = await repo.restore(req.params.id);
      if (!restored) return res.status(404).json({ error: "No removed location with that id." });
      res.json({ location: restored });
    })
  );

  // ---- facility requests ------------------------------------------

  const REVIEW_ROLES = ["supervisor", ...ADMIN_ROLES];

  app.get("/api/facility-requests", requireRole("worker", ...REVIEW_ROLES), wrap(async (req, res) => {
    const all = REVIEW_ROLES.includes(req.user.role);
    res.json({ requests: await repo.listRequests({ userSub: req.user.sub, workerId: req.user.wid, all }) });
  }));

  app.get("/api/facility-requests/:id", requireRole("worker", ...REVIEW_ROLES), wrap(async (req, res) => {
    const request = await repo.getRequest(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found." });
    if (!REVIEW_ROLES.includes(req.user.role)) {
      const owner = await repo.getRequestOwner(req.params.id);
      const mine =
        owner.requestedByUser === req.user.sub ||
        (owner.isDemo && req.user.wid && owner.requestedByWorkerId === req.user.wid);
      if (!mine) return res.status(403).json({ error: "You can only view your own requests." });
    }
    res.json({ request });
  }));

  app.post(
    "/api/facility-requests",
    requireRole("worker", "supervisor"),
    wrap(async (req, res) => {
      const data = validateRequest(req.body);
      res.status(201).json({ request: await repo.createRequest(data, req.user.sub) });
    })
  );

  app.patch(
    "/api/facility-requests/:id/status",
    requireRole(...REVIEW_ROLES),
    wrap(async (req, res) => {
      const status = req.body?.status;
      if (![REQUEST_STATUS.APPROVED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.UNDER_REVIEW].includes(status)) {
        return res.status(400).json({ error: "Status must be APPROVED, REJECTED or UNDER_REVIEW." });
      }
      if (status !== REQUEST_STATUS.UNDER_REVIEW && !ADMIN_ROLES.includes(req.user.role)) {
        return res.status(403).json({ error: "Only a government official can approve or reject." });
      }
      const rejectionReason = cleanText(req.body?.rejectionReason ?? "", 300);
      if (status === REQUEST_STATUS.REJECTED && !rejectionReason) {
        return res.status(400).json({ error: "A rejection reason is required." });
      }
      const result = await repo.setRequestStatus(req.params.id, status, {
        actor: req.user.name || req.user.sub,
        rejectionReason,
      });
      if (result.error === "not_found") return res.status(404).json({ error: "Request not found." });
      if (result.error === "finalised") {
        return res.status(409).json({ error: `This request was already ${result.current.toLowerCase()}.` });
      }
      res.json(result);
    })
  );

  // ---- errors ------------------------------------------------------

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: "Please fix the highlighted fields.", fields: err.errors });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body." });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });
    const id = crypto.randomBytes(4).toString("hex");
    console.error(`[${id}]`, err);
    res.status(500).json({ error: `Unexpected server error (ref ${id}).` });
  });

  return app;
}
