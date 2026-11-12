// EcoSetu API.
//
//   GET    /api/health
//   POST   /api/auth/firebase              { idToken, name? }   (role comes from the database)
//            -> { accessToken, expiresIn, user } + refresh token in an httpOnly cookie
//            (/api/auth/firebase-login is kept as an alias)
//   POST   /api/auth/demo                  { role } -> same, as a seeded demo user;
//            only when DEMO_LOGIN_ENABLED=true (otherwise the route doesn't exist)
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
//   GET    /api/geo/search?q=  · /api/geo/reverse?lat=&lon=   signed in (Nominatim, see geocode.js)
//   PATCH  /api/facility-requests/:id/status  { status, rejectionReason? }
//            APPROVED/REJECTED: official, superadmin · UNDER_REVIEW: + supervisor

import express from "express";
import helmet from "helmet";
import { createLogger, requestLogger } from "./logger.js";
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
  clientIp,
  createLoginLimiter,
  isCrossSite,
  rateLimit,
  readCookie,
  requireRole,
  requireWebClient,
  setRefreshCookie,
} from "./auth.js";
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from "./tokens.js";
import { registerCivicRoutes } from "./routes-civic.js";
import { registerGeoRoutes } from "./geocode.js";
import { createPhotoService, photoNote } from "./photos.js";
import { sendJsonWithEtag } from "./etag.js";
import {
  ValidationError,
  cleanText,
  onlyFields,
  pageOf,
  parsePage,
  validateDemoLogin,
  validateFirebaseLogin,
  validateLocation,
  validateRequest,
} from "./validate.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * `logSink` receives one JSON line per log event (console.log by default);
 * tests pass their own to read what would be logged.
 */
export function createApp({ config, repo, verifyFirebase, photoStore = null, logSink, geoFetch }) {
  const photos = createPhotoService({ photoStore, repo });
  const logger = createLogger(logSink);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);

  // One line per request: method, path (no query), status, time, role.
  app.use(requestLogger(logger));

  // Security headers. The API only ever returns JSON or images, so nothing
  // may be loaded or framed from its responses.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-origin" },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "no-referrer" },
      strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    })
  );

  // CORS. On Vercel the app and the API share an origin, so a browser sends
  // no Origin or our own. Another site gets the CORS headers only if it is in
  // ECOSETU_CORS_ORIGINS; any other site is refused outright.
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-EcoSetu-Client, If-None-Match");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    } else if (origin && isCrossSite(req)) {
      return res.status(403).json({ error: "Requests from this site are not allowed." });
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Vercel refuses request bodies over 4.5 MB before they reach the app; the
  // web client compresses photos to under 1 MB, so 4 MB leaves headroom.
  app.use(express.json({ limit: "4mb" }));
  app.use(authenticate({ config, repo }));

  // Every write (POST/PUT/PATCH/DELETE) is counted per signed-in user (per IP
  // only when nobody is signed in); sign-in has its own limit below, and new
  // complaints also have their own per-user limit.
  const writeLimiter = rateLimit({ ...config.writeRateLimit, repo, config, name: "write" });
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.path.startsWith("/auth/") || req.path.startsWith("/cron/")) return next();
    return writeLimiter(req, res, next);
  });

  const loginLimiter = createLoginLimiter({ repo, config });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // ---- auth --------------------------------------------------------

  // Every /api/auth route shares one request budget per IP.
  app.use("/api/auth", rateLimit({ ...config.authRateLimit, repo, config, name: "auth" }));

  // What the client learns about a user. The phone number appears only masked.
  const publicUser = (u) => ({
    uid: u.uid,
    role: u.role,
    name: u.name,
    phone: u.phoneMasked ?? null,
    isDemo: Boolean(u.isDemo),
    ...(u.workerId ? { wid: u.workerId } : {}),
  });

  // Issues a fresh access token + a rotated refresh token (httpOnly cookie).
  const startSession = async (req, res, user) => {
    const accessToken = await signAccessToken(user, config.jwtSecret, config.accessTtlSeconds, config.tokenEnv);
    const refreshToken = await signRefreshToken(user, config.jwtRefreshSecret, config.refreshTtlSeconds, config.tokenEnv);
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
  const firebaseLogin = wrap(async (req, res) => {
    const ip = clientIp(req, config);
    if (await loginLimiter.blocked(ip)) {
      return res.status(429).json({ error: "Too many failed attempts. Try again later." });
    }
    const body = validateFirebaseLogin(req.body);

    // The phone number comes from the verified ID token — never from the body.
    let verified;
    try {
      verified = await verifyFirebase(body.idToken);
    } catch {
      await loginLimiter.fail(ip);
      return res.status(401).json({ error: "Phone verification failed. Please sign in again." });
    }
    const mobile = verified.phone.replace(/\D/g, "").slice(-10);
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ error: "This account has no verified mobile number." });
    }
    await loginLimiter.reset(ip);

    let user;
    try {
      user = await repo.upsertUser({ uid: verified.uid, phone: mobile, name: body.name });
    } catch (err) {
      if (err.code === "phone_taken") {
        return res.status(409).json({ error: "This mobile number is already linked to another account." });
      }
      if (err.code === "demo_account") {
        return res.status(403).json({ error: "This account can't be used with phone login." });
      }
      throw err;
    }
    res.json(await startSession(req, res, user));
  });
  app.post("/api/auth/firebase", firebaseLogin);
  app.post("/api/auth/firebase-login", firebaseLogin);

  // The labelled demo login. The route only exists when DEMO_LOGIN_ENABLED is
  // true, so a production deployment without it answers exactly like any
  // unknown path. The client chooses which seeded demo user; the role is
  // whatever the database holds for that user.
  if (config.demoLoginEnabled) {
    const demoLimiter = rateLimit({ ...config.demoRateLimit, repo, config, name: "demo", perIp: true });
    app.post("/api/auth/demo", demoLimiter, wrap(async (req, res) => {
      const uid = validateDemoLogin(req.body);
      const user = await repo.getUserByUid(uid);
      if (!user?.isDemo) {
        return res.status(503).json({ error: "The demo accounts are not set up on this server. Run npm run seed." });
      }
      res.json(await startSession(req, res, user));
    }));
  }

  // Swaps the refresh cookie for a new access token. Each refresh token works
  // once; reusing an old one revokes the user's other refresh tokens too
  // (possible theft).
  app.post("/api/auth/refresh", requireWebClient(config), wrap(async (req, res) => {
    const fail = () => {
      clearRefreshCookie(req, res, config);
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    };
    const token = readCookie(req, REFRESH_COOKIE);
    const claims = token ? await verifyRefreshToken(token, config.jwtRefreshSecret, config.tokenEnv) : null;
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
    res.json({ user: publicUser({ ...req.user, workerId: req.user.wid }) });
  });

  // ---- locations ---------------------------------------------------

  app.get("/api/locations", wrap(async (req, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    if (type && !LOCATION_TYPES.includes(type)) {
      return res.status(400).json({ error: "Unknown location type." });
    }
    // ?kind=facility (bins + toilets) or ?kind=building (everything else), as an alternative to one exact type.
    const kind = req.query.kind;
    if (kind !== undefined && (!["facility", "building"].includes(kind) || type)) {
      return res.status(400).json({ error: `kind must be "facility" or "building", and can't be combined with type.` });
    }
    const q = typeof req.query.q === "string" ? cleanText(req.query.q, 80) : undefined;
    const paging = parsePage(req.query);
    const { total, items } = await repo.pageLocations({ type, kind, q }, paging);
    sendJsonWithEtag(req, res, pageOf(paging, total, items, "locations"));
  }));

  app.get("/api/locations/removed", requireRole(...ADMIN_ROLES), wrap(async (req, res) => {
    const paging = parsePage(req.query);
    const { total, items } = await repo.pageRemoved(paging);
    res.json(pageOf(paging, total, items, "locations"));
  }));

  // Everything the map draws, in one response: every live bin and toilet
  // (up to config.mapLimit) with only the fields it needs. Public data, so a
  // short shared cache is fine.
  app.get("/api/locations/map", wrap(async (req, res) => {
    const { total, truncated, items } = await repo.mapLocations(config.mapLimit);
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    sendJsonWithEtag(req, res, { items, total, truncated });
  }));

  // One live location in full, for detail screens.
  app.get("/api/locations/:id", wrap(async (req, res) => {
    const location = await repo.getLocation(req.params.id);
    if (!location) return res.status(404).json({ error: "Location not found." });
    res.json({ location });
  }));

  app.post(
    "/api/locations",
    requireRole(...ADMIN_ROLES),
    wrap(async (req, res) => {
      const data = validateLocation(req.body);
      const created = await repo.createLocation(data, { name: req.user.name || req.user.uid, uid: req.user.uid });
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
      const body = onlyFields(req.body, ["reason"]);
      const reason = cleanText(body.reason ?? "", 200) || "No reason recorded";
      await repo.softDelete(req.params.id, { name: req.user.name || req.user.uid, uid: req.user.uid }, reason);
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
    const paging = parsePage(req.query);
    const { total, items } = await repo.pageRequests({ userId: req.user.uid, workerId: req.user.wid, all }, paging);
    sendJsonWithEtag(req, res, pageOf(paging, total, items, "requests"));
  }));

  // A request's photo, with the same visibility as the request itself.
  app.get("/api/facility-requests/:id/photo", requireRole("worker", ...REVIEW_ROLES), wrap(async (req, res) => {
    const owner = await repo.getRequestOwner(req.params.id);
    const mine =
      owner &&
      (REVIEW_ROLES.includes(req.user.role) ||
        owner.requestedByUser === req.user.uid ||
        (owner.isDemo && req.user.wid && owner.requestedByWorkerId === req.user.wid));
    const ref = mine ? (owner.photoPath ? { pathname: owner.photoPath } : owner.legacyPhoto ? { legacy: owner.legacyPhoto } : null) : null;
    if (!(await photos.send(res, ref))) res.status(404).json({ error: "Request not found." });
  }));

  app.get("/api/facility-requests/:id", requireRole("worker", ...REVIEW_ROLES), wrap(async (req, res) => {
    const request = await repo.getRequest(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found." });
    if (!REVIEW_ROLES.includes(req.user.role)) {
      const owner = await repo.getRequestOwner(req.params.id);
      const mine =
        owner.requestedByUser === req.user.uid ||
        (owner.isDemo && req.user.wid && owner.requestedByWorkerId === req.user.wid);
      // 404, not 403: someone else's request id must look exactly like one that
      // doesn't exist, so ids can't be probed.
      if (!mine) return res.status(404).json({ error: "Request not found." });
    }
    res.json({ request });
  }));

  app.post(
    "/api/facility-requests",
    requireRole("worker", "supervisor"),
    wrap(async (req, res) => {
      const { photo, ...data } = validateRequest(req.body);
      const { pathname: photoPath, photoSaved } = await photos.tryUpload(photo, "facility-requests");
      try {
        const request = await repo.createRequest({ ...data, photoPath }, req.user.uid);
        res.status(201).json({ request, ...photoNote(photoSaved, "Photo could not be saved, your request was submitted without it.") });
      } catch (err) {
        await photos.discard([photoPath]);
        throw err;
      }
    })
  );

  app.patch(
    "/api/facility-requests/:id/status",
    requireRole(...REVIEW_ROLES),
    wrap(async (req, res) => {
      const status = onlyFields(req.body, ["status", "rejectionReason"]).status;
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
        actor: { name: req.user.name || req.user.uid, uid: req.user.uid },
        rejectionReason,
      });
      if (result.error === "not_found") return res.status(404).json({ error: "Request not found." });
      if (result.error === "finalised") {
        return res.status(409).json({ error: `This request was already ${result.current.toLowerCase()}.` });
      }
      // Tell the worker who asked (if their account still exists).
      const owner = await repo.getRequestOwner(req.params.id);
      if (owner?.requestedByUser && (await repo.getUserByUid(owner.requestedByUser))) {
        const verb = { APPROVED: "was approved", REJECTED: "was rejected", UNDER_REVIEW: "is under review" }[status];
        await repo.notify({
          userId: owner.requestedByUser,
          kind: "facility_request",
          requestId: req.params.id,
          message: `Your facility request ${req.params.id} ${verb}`,
          detail: status === REQUEST_STATUS.REJECTED ? rejectionReason : result.request.suggestedName,
        });
      }
      res.json(result);
    })
  );

  registerGeoRoutes(app, { repo, config, wrap, fetchImpl: geoFetch });
  registerCivicRoutes(app, { repo, config, wrap, photos, photoStore });

  // ---- errors ------------------------------------------------------

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err?.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: "Please fix the highlighted fields.", fields: err.errors });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body." });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });
    // Only the error's name and (redacted) message are logged — never the
    // request — and the reply carries just a reference to find the log line.
    const id = req.id ?? "--------";
    logger.error({ id, path: req.path, error: err?.name ?? "Error", message: String(err?.message ?? err).slice(0, 300) });
    res.status(500).json({ error: `Unexpected server error (ref ${id}).` });
  });

  return app;
}
