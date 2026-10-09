// EcoSetu API.
//
//   GET    /api/health
//   POST   /api/auth/login                 { role, mobile, accessCode?, workerId?, name? }
//   GET    /api/auth/me
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
  authenticate,
  codesMatch,
  createLoginLimiter,
  requireRole,
  signToken,
} from "./auth.js";
import { ValidationError, cleanText, validateLocation, validateRequest } from "./validate.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp({ config, repo }) {
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
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: "6mb" }));
  app.use(authenticate(config));

  const loginLimiter = createLoginLimiter();

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // ---- auth --------------------------------------------------------

  app.get("/api/auth/config", (_req, res) => res.json({ accessCodeRequired: config.requireAccessCodes }));

  app.post("/api/auth/login", (req, res) => {
    const ip = req.ip ?? "unknown";
    if (loginLimiter.blocked(ip)) {
      return res.status(429).json({ error: "Too many failed attempts. Try again later." });
    }
    const body = req.body ?? {};
    const role = body.role;
    const mobile = typeof body.mobile === "string" ? body.mobile.replace(/\D/g, "") : "";
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Unknown role." });
    if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });

    if (role !== "citizen" && config.requireAccessCodes && !codesMatch(body.accessCode, config.accessCodes[role])) {
      loginLimiter.fail(ip);
      return res.status(401).json({ error: "Incorrect access code for this role." });
    }
    loginLimiter.reset(ip);

    const workerId =
      typeof body.workerId === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(body.workerId) ? body.workerId : null;
    const user = {
      sub: `${role}:${mobile}`,
      role,
      name: cleanText(body.name ?? "", 80) || role,
      ...(workerId ? { wid: workerId } : {}),
    };
    const token = signToken(user, config.jwtSecret, config.tokenTtlSeconds);
    res.json({ token, user, expiresIn: config.tokenTtlSeconds });
  });

  app.get("/api/auth/me", requireRole(...ROLES), (req, res) => {
    const { sub, role, name, wid } = req.user;
    res.json({ user: { sub, role, name, wid } });
  });

  // ---- locations ---------------------------------------------------

  app.get("/api/locations", (req, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    if (type && !LOCATION_TYPES.includes(type)) {
      return res.status(400).json({ error: "Unknown location type." });
    }
    const q = typeof req.query.q === "string" ? cleanText(req.query.q, 80) : undefined;
    res.json({ locations: repo.listLocations({ type, q }) });
  });

  app.get("/api/locations/removed", requireRole(...ADMIN_ROLES), (_req, res) => {
    res.json({ locations: repo.listRemoved() });
  });

  app.post(
    "/api/locations",
    requireRole(...ADMIN_ROLES),
    wrap((req, res) => {
      const data = validateLocation(req.body);
      const created = repo.createLocation(data, req.user.name || req.user.sub);
      res.status(201).json({ location: created });
    })
  );

  app.patch(
    "/api/locations/:id",
    requireRole(...ADMIN_ROLES),
    wrap((req, res) => {
      const existing = repo.getLocation(req.params.id);
      if (!existing) return res.status(404).json({ error: "Location not found." });
      if (existing.type === "campus") {
        return res.status(403).json({ error: "The verified campus reference can't be edited." });
      }
      const data = validateLocation(req.body, { existing });
      res.json({ location: repo.updateLocation(req.params.id, data) });
    })
  );

  app.delete(
    "/api/locations/:id",
    requireRole(...ADMIN_ROLES),
    wrap((req, res) => {
      const existing = repo.getLocation(req.params.id);
      if (!existing) return res.status(404).json({ error: "Location not found." });
      if (existing.type === "campus") {
        return res.status(403).json({ error: "The verified campus reference can't be removed." });
      }
      const reason = cleanText(req.body?.reason ?? "", 200) || "No reason recorded";
      repo.softDelete(req.params.id, req.user.name || req.user.sub, reason);
      res.json({ ok: true, id: req.params.id });
    })
  );

  app.post(
    "/api/locations/:id/restore",
    requireRole(...ADMIN_ROLES),
    wrap((req, res) => {
      const restored = repo.restore(req.params.id);
      if (!restored) return res.status(404).json({ error: "No removed location with that id." });
      res.json({ location: restored });
    })
  );

  // ---- facility requests ------------------------------------------

  const REVIEW_ROLES = ["supervisor", ...ADMIN_ROLES];

  app.get("/api/facility-requests", requireRole("worker", ...REVIEW_ROLES), (req, res) => {
    const all = REVIEW_ROLES.includes(req.user.role);
    res.json({ requests: repo.listRequests({ userSub: req.user.sub, workerId: req.user.wid, all }) });
  });

  app.get("/api/facility-requests/:id", requireRole("worker", ...REVIEW_ROLES), (req, res) => {
    const request = repo.getRequest(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found." });
    if (!REVIEW_ROLES.includes(req.user.role)) {
      const owner = repo.getRequestOwner(req.params.id);
      const mine =
        owner.requested_by_user === req.user.sub ||
        (owner.is_demo && req.user.wid && owner.requested_by_worker_id === req.user.wid);
      if (!mine) return res.status(403).json({ error: "You can only view your own requests." });
    }
    res.json({ request });
  });

  app.post(
    "/api/facility-requests",
    requireRole("worker", "supervisor"),
    wrap((req, res) => {
      const data = validateRequest(req.body);
      res.status(201).json({ request: repo.createRequest(data, req.user.sub) });
    })
  );

  app.patch(
    "/api/facility-requests/:id/status",
    requireRole(...REVIEW_ROLES),
    wrap((req, res) => {
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
      const result = repo.setRequestStatus(req.params.id, status, {
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
