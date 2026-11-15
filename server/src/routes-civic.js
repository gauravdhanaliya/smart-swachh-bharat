// Routes for complaints, votes, notifications, toilet ratings, consent and
// "delete my data". Every rule here is enforced on the server:
//   - who may call a route: requireRole (403 for the wrong role)
//   - what may be sent: validate-civic.js (400, unknown fields refused)
//   - whose record it is: a scope in every query, so someone else's record
//     is a 404, indistinguishable from one that doesn't exist
//
//   POST   /api/complaints                       citizen   (per-user rate limit)
//   GET    /api/complaints                       any role  (own / assigned / all)   ?facilityType=&facilityId=&status=
//   GET    /api/complaints/:id                   same visibility
//   GET    /api/complaints/:id/photo             same visibility (streamed from the private Blob store)
//   GET    /api/complaints/:id/resolution-photo  same visibility
//   DELETE /api/complaints/:id                   official, superadmin   (deletes its photos too)
//   POST   /api/complaints/:id/assign            official, superadmin   { workerId }
//   PATCH  /api/complaints/:id/status            worker (assigned)      { status, resolutionNote?, resolutionPhoto? }
//   PATCH  /api/complaints/:id/priority          official, superadmin   { priority }
//   POST   /api/complaints/:id/vote              citizen (own)          { direction: "up" | "down" | null }
//   GET    /api/locations/:id/complaints/summary public    { facilityId, openCount }
//   GET    /api/notifications                    any role (own)
//   PATCH  /api/notifications/:id/read           own
//   POST   /api/notifications/read-all           own
//   PUT    /api/toilets/:id/rating               citizen   { stars, categories?, comment? }
//   GET    /api/toilets/:id/rating/me            signed in
//   GET    /api/toilets/:id/ratings              public, anonymous, paged
//   GET    /api/toilets/:id/ratings/summary      public
//   GET    /api/toilets/ratings/summary?ids=a,b  public (up to 100 ids)
//   GET    /api/toilets/ratings/low              official, superadmin   (average < 3, at least 3 ratings)
//   GET    /api/me/consent · PUT /api/me/consent · DELETE /api/me/consent (withdraw: signs out)
//   DELETE /api/me/data                          { confirm: true }
//   GET    /api/cron/blob-deletions              Vercel Cron only (Authorization: Bearer CRON_SECRET)

import crypto from "node:crypto";
import { ADMIN_ROLES, COMPLAINT_STATUS, FACILITY_CATEGORIES, ROLES, WORKER_TRANSITIONS } from "./constants.js";
import { clearRefreshCookie, clientIp, requireRole } from "./auth.js";
import { ConflictError } from "./civic.js";
import {
  FACILITY_ID_PATTERN,
  validateAssign,
  validateComplaint,
  validateConsent,
  validateDataDeletion,
  validatePriority,
  validateRating,
  validateStatusChange,
  validateVote,
} from "./validate-civic.js";
import { ValidationError, onlyFields, pageOf, parsePage } from "./validate.js";
import { photoNote } from "./photos.js";
import { sendJsonWithEtag } from "./etag.js";
import { validateProfile, validateWorker } from "./validate-civic.js";
import { hashEmail, maskEmail } from "./identity.js";

const NOT_FOUND = { error: "Complaint not found." };
const REVIEWERS = ["supervisor", ...ADMIN_ROLES];

/** Which complaints a user may see: their own, the ones assigned to them, or all. */
function complaintScope(user) {
  if (user.role === "citizen") return { citizenId: user.uid };
  if (user.role === "worker") return { assignedWorkerId: user.wid ?? "\u0000no-worker-id" };
  return {};
}

const NOTICE = {
  ASSIGNED: (c) => ({ message: `Complaint ${c.id} assigned to ${c.assignedWorkerName}`, detail: `${c.issueType} at ${c.location.address}` }),
  IN_PROGRESS: (c) => ({ message: `${c.assignedWorkerName} is working on complaint ${c.id}`, detail: `${c.issueType} at ${c.location.address}` }),
  RESOLVED: (c) => ({ message: `Complaint ${c.id} has been resolved`, detail: c.resolutionNote }),
};

export function registerCivicRoutes(app, { repo, config, wrap, photos, photoStore }) {
  // Tells the complaint's owner (if they still have an account) what changed.
  const notifyOwner = async (complaintId, complaint) => {
    const raw = await repo.getComplaintRaw(complaintId);
    if (!raw?.citizenId) return;
    await repo.notify({ userId: raw.citizenId, kind: "complaint", complaintId, status: complaint.status, ...NOTICE[complaint.status](complaint) });
  };

  /**
   * Counts one action against a per-user and a per-IP limit (a new anonymous
   * account costs nothing, so a per-user limit alone is easy to dodge).
   * Answers 429 and returns false when either is used up.
   */
  async function withinLimits(req, res, name, perUser, perIp, message) {
    for (const [key, { max, windowMs }] of [
      [`${name}:user:${req.user.uid}`, perUser],
      [`${name}:ip:${clientIp(req, config)}`, perIp],
    ]) {
      const { count, resetAt } = await repo.hitRateLimit(key, windowMs);
      if (count > max) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))));
        res.status(429).json({ error: message });
        return false;
      }
    }
    return true;
  }

  // ---- complaints --------------------------------------------------------

  app.post("/api/complaints", requireRole("citizen"), wrap(async (req, res) => {
    const { photo, ...data } = validateComplaint(req.body);
    const message = "You have sent a lot of reports recently. Please try again later.";
    if (!(await withinLimits(req, res, "complaint", config.complaintRateLimit, config.complaintIpRateLimit, message))) return;
    // Uploaded only after the auth, validation and rate-limit checks above.
    // If the store can't take it, the complaint is still filed, without it.
    const { pathname: photoPath, photoSaved } = await photos.tryUpload(photo, "complaints");
    try {
      const complaint = await repo.createComplaint({ ...data, photoPath }, { uid: req.user.uid, name: req.user.name });
      res.status(201).json({ complaint, ...photoNote(photoSaved) });
    } catch (err) {
      await photos.discard([photoPath]); // the report wasn't saved, so neither is its photo
      if (err instanceof ConflictError) return res.status(409).json({ error: err.message, existingId: err.existingId });
      throw err;
    }
  }));

  app.get("/api/complaints", requireRole(...ROLES), wrap(async (req, res) => {
    const paging = parsePage(req.query);
    const filters = {};
    const { facilityType, facilityId, status } = req.query;
    const errors = {};
    if (facilityType !== undefined) {
      if (typeof facilityType === "string" && Object.hasOwn(FACILITY_CATEGORIES, facilityType)) filters.facilityType = facilityType;
      else errors.facilityType = 'facilityType must be "bin" or "toilet".';
    }
    if (facilityId !== undefined) {
      if (typeof facilityId === "string" && FACILITY_ID_PATTERN.test(facilityId)) filters.facilityId = facilityId;
      else errors.facilityId = "Unknown facility id.";
    }
    if (status !== undefined) {
      if (Object.values(COMPLAINT_STATUS).includes(status)) filters.status = status;
      else errors.status = "Unknown status.";
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const { total, items } = await repo.listComplaints(complaintScope(req.user), filters, paging, req.user.uid);
    sendJsonWithEtag(req, res, pageOf(paging, total, items)); // polled: unchanged -> 304
  }));

  app.get("/api/complaints/:id", requireRole(...ROLES), wrap(async (req, res) => {
    const complaint = await repo.getComplaint(req.params.id, complaintScope(req.user), req.user.uid);
    if (!complaint) return res.status(404).json(NOT_FOUND);
    res.json({ complaint });
  }));

  // Photos: the same visibility as the complaint. Anyone else gets the same
  // 404 as for a complaint that doesn't exist.
  for (const [suffix, which] of [["photo", "photo"], ["resolution-photo", "resolution"]]) {
    app.get(`/api/complaints/:id/${suffix}`, requireRole(...ROLES), wrap(async (req, res) => {
      const ref = await repo.getComplaintPhotoRef(req.params.id, complaintScope(req.user), which);
      if (!(await photos.send(res, ref))) res.status(404).json(NOT_FOUND);
    }));
  }

  app.delete("/api/complaints/:id", requireRole(...ADMIN_ROLES), wrap(async (req, res) => {
    onlyFields(req.body, []);
    const photoPaths = await repo.deleteComplaint(req.params.id);
    if (!photoPaths) return res.status(404).json(NOT_FOUND);
    await photos.discard(photoPaths);
    res.json({ deleted: true });
  }));

  app.post("/api/complaints/:id/assign", requireRole(...ADMIN_ROLES), wrap(async (req, res) => {
    const workerId = validateAssign(req.body);
    const worker = await repo.findActiveWorker(workerId);
    if (!worker) throw new ValidationError({ workerId: "No active worker has that id." });
    if (!(await repo.getComplaintRaw(req.params.id))) return res.status(404).json(NOT_FOUND);
    const complaint = await repo.assignComplaint(req.params.id, { workerId, workerName: worker.name, workerUid: worker.uid });
    if (!complaint) return res.status(409).json({ error: "Work on this complaint has already started or finished." });
    await notifyOwner(req.params.id, complaint);
    res.json({ complaint });
  }));

  app.patch("/api/complaints/:id/status", requireRole("worker"), wrap(async (req, res) => {
    const change = validateStatusChange(req.body);
    const current = await repo.getComplaintRaw(req.params.id);
    // A complaint not assigned to this worker is none of their business: 404.
    if (!current || !req.user.wid || current.assignedWorkerId !== req.user.wid) return res.status(404).json(NOT_FOUND);
    if (!WORKER_TRANSITIONS[current.status]?.includes(change.status)) {
      return res.status(409).json({ error: `A ${current.status} complaint can't become ${change.status}.`, status: current.status });
    }
    let set = {};
    let photoSaved = null;
    if (change.status === COMPLAINT_STATUS.RESOLVED) {
      const upload = await photos.tryUpload(change.resolutionPhoto, "resolutions");
      photoSaved = upload.photoSaved;
      set = { resolutionNote: change.resolutionNote, resolutionPhotoPath: upload.pathname };
    }
    const complaint = await repo.transitionComplaint(req.params.id, { from: current.status, to: change.status, workerId: req.user.wid, set });
    if (!complaint) {
      await photos.discard([set.resolutionPhotoPath]);
      return res.status(409).json({ error: "This complaint was changed by someone else. Reload and try again." });
    }
    await notifyOwner(req.params.id, complaint);
    res.json({ complaint, ...photoNote(photoSaved, "Photo could not be saved, the task was marked resolved without it.") });
  }));

  app.patch("/api/complaints/:id/priority", requireRole(...ADMIN_ROLES), wrap(async (req, res) => {
    const priority = validatePriority(req.body);
    const complaint = await repo.setComplaintPriority(req.params.id, priority);
    if (!complaint) return res.status(404).json(NOT_FOUND);
    res.json({ complaint });
  }));

  app.post("/api/complaints/:id/vote", requireRole("citizen"), wrap(async (req, res) => {
    const direction = validateVote(req.body);
    const scope = complaintScope(req.user);
    if (!(await repo.getComplaint(req.params.id, scope, req.user.uid))) return res.status(404).json(NOT_FOUND);
    if (!(await withinLimits(req, res, "vote", config.voteRateLimit, config.voteIpRateLimit, "Too many votes. Please try again later."))) return;
    await repo.voteComplaint(req.params.id, req.user.uid, direction);
    res.json({ complaint: await repo.getComplaint(req.params.id, scope, req.user.uid) });
  }));

  app.get("/api/locations/:id/complaints/summary", wrap(async (req, res) => {
    if (!(await repo.getLocation(req.params.id))) return res.status(404).json({ error: "Location not found." });
    res.json({ facilityId: req.params.id, openCount: await repo.openComplaintCount(req.params.id) });
  }));

  // ---- notifications ---------------------------------------------------------

  app.get("/api/notifications", requireRole(...ROLES), wrap(async (req, res) => {
    const paging = parsePage(req.query);
    const { total, unread, items } = await repo.listNotifications(req.user.uid, paging);
    sendJsonWithEtag(req, res, { ...pageOf(paging, total, items), unread }); // polled: unchanged -> 304
  }));

  app.patch("/api/notifications/:id/read", requireRole(...ROLES), wrap(async (req, res) => {
    const notification = await repo.markNotificationRead(req.user.uid, req.params.id);
    if (!notification) return res.status(404).json({ error: "Notification not found." });
    res.json({ notification });
  }));

  app.post("/api/notifications/read-all", requireRole(...ROLES), wrap(async (req, res) => {
    res.json({ updated: await repo.markAllNotificationsRead(req.user.uid) });
  }));

  // ---- toilet ratings --------------------------------------------------------

  app.get("/api/toilets/ratings/summary", wrap(async (req, res) => {
    const ids = typeof req.query.ids === "string" ? req.query.ids.split(",").filter(Boolean) : [];
    if (!ids.length || ids.length > 100 || !ids.every((id) => FACILITY_ID_PATTERN.test(id))) {
      throw new ValidationError({ ids: "Send 1 to 100 toilet ids, comma-separated." });
    }
    res.json({ items: await repo.ratingSummaries([...new Set(ids)]) });
  }));

  app.get("/api/toilets/ratings/low", requireRole(...ADMIN_ROLES), wrap(async (req, res) => {
    const paging = parsePage(req.query);
    const { total, items } = await repo.lowRatedToilets(paging);
    res.json(pageOf(paging, total, items));
  }));

  app.put("/api/toilets/:id/rating", requireRole("citizen"), wrap(async (req, res) => {
    const rating = validateRating(req.body);
    if (!(await repo.isLiveToilet(req.params.id))) return res.status(404).json({ error: "Toilet not found." });
    if (!(await withinLimits(req, res, "rating", config.ratingRateLimit, config.ratingIpRateLimit, "Too many ratings. Please try again later."))) return;
    const saved = await repo.upsertRating(req.params.id, req.user.uid, rating);
    res.json({ rating: saved, summary: await repo.ratingSummary(req.params.id) });
  }));

  app.get("/api/toilets/:id/rating/me", requireRole(...ROLES), wrap(async (req, res) => {
    res.json({ rating: await repo.getRating(req.params.id, req.user.uid) });
  }));

  app.get("/api/toilets/:id/ratings", wrap(async (req, res) => {
    const paging = parsePage(req.query);
    if (!(await repo.isLiveToilet(req.params.id))) return res.status(404).json({ error: "Toilet not found." });
    const { total, items } = await repo.listRatings(req.params.id, paging);
    res.json(pageOf(paging, total, items));
  }));

  app.get("/api/toilets/:id/ratings/summary", wrap(async (req, res) => {
    if (!(await repo.isLiveToilet(req.params.id))) return res.status(404).json({ error: "Toilet not found." });
    res.json(await repo.ratingSummary(req.params.id));
  }));

  // ---- profile ---------------------------------------------------------------

  app.get("/api/profile", requireRole(...ROLES), wrap(async (req, res) => {
    res.json({ profile: await repo.getProfile(req.user) });
  }));

  app.patch("/api/profile", requireRole(...ROLES), wrap(async (req, res) => {
    const changes = validateProfile(req.body, { gov: ADMIN_ROLES.includes(req.user.role) });
    res.json({ profile: await repo.updateProfile(req.user, changes) });
  }));

  // ---- worker directory (officials) ---------------------------------------------

  const actor = (req) => ({ name: req.user.name || req.user.uid, uid: req.user.uid });

  app.get("/api/workers", requireRole(...ADMIN_ROLES), wrap(async (req, res) => {
    const paging = parsePage(req.query);
    const removed = req.query.removed === "true";
    const { total, items } = await repo.pageWorkers({ removed }, paging);
    res.json(pageOf(paging, total, items));
  }));

  // Adds a worker by the email they will sign up with. Only its keyed hash and
  // a masked copy are stored; becoming the worker needs that email verified.
  app.post("/api/workers", requireRole(...ADMIN_ROLES), wrap(async (req, res) => {
    const { email, ...data } = validateWorker(req.body);
    try {
      const worker = await repo.addWorker({ ...data, emailHash: hashEmail(email, config.identityHashSecret), emailMasked: maskEmail(email) }, actor(req));
      res.status(201).json({ worker });
    } catch (err) {
      if (err.code === "email_in_directory") return res.status(409).json({ error: "A worker with this email is already in the directory." });
      if (err.code === "email_is_official") return res.status(409).json({ error: "This email belongs to an official's account, so it can't be added as a worker." });
      throw err;
    }
  }));

  app.delete("/api/workers/:id", requireRole(...ADMIN_ROLES), wrap(async (req, res) => {
    const body = onlyFields(req.body, ["reason"]);
    if (body.reason !== undefined && typeof body.reason !== "string") throw new ValidationError({ reason: "Reason must be text." });
    const reason = (body.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || "No reason recorded";
    const worker = await repo.removeWorker(req.params.id, actor(req), reason);
    if (!worker) return res.status(404).json({ error: "Worker not found." });
    res.json({ worker });
  }));

  app.post("/api/workers/:id/restore", requireRole(...ADMIN_ROLES), wrap(async (req, res) => {
    onlyFields(req.body, []);
    const worker = await repo.restoreWorker(req.params.id);
    if (!worker) return res.status(404).json({ error: "No removed worker with that id." });
    res.json({ worker });
  }));

  // ---- consent and "delete my data" ----------------------------------------

  const consentState = (consent) => ({
    version: config.consentVersion,
    consent,
    upToDate: consent?.version === config.consentVersion,
  });

  app.get("/api/me/consent", requireRole(...ROLES), wrap(async (req, res) => {
    res.json(consentState(await repo.getConsent(req.user.uid)));
  }));

  app.put("/api/me/consent", requireRole(...ROLES), wrap(async (req, res) => {
    // Phone-login users must accept the phone item; demo accounts have no phone.
    const consent = validateConsent(req.body);
    if (consent.version !== config.consentVersion) {
      return res.status(409).json({ error: "The privacy notice has changed. Please read it again.", version: config.consentVersion });
    }
    res.json(consentState(await repo.saveConsent(req.user.uid, consent)));
  }));

  app.delete("/api/me/consent", requireRole(...ROLES), wrap(async (req, res) => {
    onlyFields(req.body, []);
    await repo.withdrawConsent(req.user.uid);
    clearRefreshCookie(req, res, config);
    res.json({ signedOut: true });
  }));

  // Presentations: demo accounts are shared, so after one person accepts, the
  // consent screen never shows again. A demo account may clear the demo
  // accounts' consent (never anyone else's). Exists only with demo login on.
  if (config.demoLoginEnabled) {
    app.post("/api/me/consent/reset-demo", requireRole(...ROLES), wrap(async (req, res) => {
      onlyFields(req.body ?? {}, []);
      if (!req.user.isDemo) return res.status(403).json({ error: "Only the shared demo accounts can do this." });
      res.json({ reset: await repo.resetDemoConsents() });
    }));
  }

  app.delete("/api/me/data", requireRole(...ROLES), wrap(async (req, res) => {
    validateDataDeletion(req.body);
    let result;
    try {
      result = await repo.deleteUserData(req.user.uid);
    } catch (err) {
      if (err.code === "demo_account") return res.status(403).json({ error: "The shared demo accounts can't be deleted." });
      throw err;
    }
    if (!result) return res.status(404).json({ error: "Account not found." });
    const { photoPaths, ...summary } = result;
    await photos.discard(photoPaths); // after the commit; a failure is queued, not shown to the user
    clearRefreshCookie(req, res, config);
    res.json(summary);
  }));

  // ---- daily retry of failed blob deletes (Vercel Cron) ----------------------
  // The route exists only when CRON_SECRET is set; Vercel Cron sends it as a
  // Bearer token.
  if (config.cronSecret) {
    const expected = Buffer.from(`Bearer ${config.cronSecret}`);
    app.get("/api/cron/blob-deletions", wrap(async (req, res) => {
      const given = Buffer.from(String(req.headers.authorization ?? ""));
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return res.status(401).json({ error: "Not allowed." });
      }
      if (!photoStore) return res.status(503).json({ error: "No photo store is configured." });
      res.json(await repo.retryBlobDeletions(photoStore));
    }));
  }

  return { REVIEWERS };
}
