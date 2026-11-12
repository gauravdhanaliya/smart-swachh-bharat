// Repository methods for complaints, votes, notifications, toilet ratings,
// consent and data deletion. Mixed into createRepository() (db.js).
//
// Every list is sorted on a field plus _id as a tiebreak, so paging never
// skips or repeats a record that shares a timestamp with its neighbour.

import { ObjectId } from "mongodb";
import {
  ASSIGNABLE_STATUSES,
  COMPLAINT_STATUS,
  DELETED_USER_NAME,
  FACILITY_LOCATION_TYPE,
} from "./constants.js";
import { ValidationError } from "./validate.js";

const now = () => new Date().toISOString();
const isDuplicateKey = (err) => err?.code === 11000;
const round1 = (n) => Math.round(n * 10) / 10;
// The placeholder for a deleted user's id on records kept for the municipality.
const DELETED_USER_ID = "deleted-user";

export class ConflictError extends Error {
  constructor(message, extra = {}) {
    super(message);
    Object.assign(this, extra);
  }
}

// Every field that holds a photo or points at one. A list must never read them.
export const PHOTO_FIELDS = ["photo", "resolutionPhoto", "photoPath", "resolutionPhotoPath"];

/**
 * The aggregation behind every complaint list. It works out whether a photo
 * exists, then its final $project drops every photo field, so the database
 * never returns photo data (or blob pathnames) for a list — only the flags.
 */
export function complaintListPipeline(match, { skip, limit }) {
  const present = (field) => ({ $eq: [{ $type: `$${field}` }, "string"] });
  return [
    { $match: match },
    { $sort: { createdAt: -1, _id: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $addFields: {
        hasPhoto: { $or: [present("photoPath"), present("photo")] },
        hasResolutionPhoto: { $or: [present("resolutionPhotoPath"), present("resolutionPhoto")] },
      },
    },
    { $project: { ...Object.fromEntries(PHOTO_FIELDS.map((f) => [f, 0])), openKey: 0 } },
  ];
}

// What clients see of a complaint. The owner's id, the assigned worker's
// account id and blob pathnames never leave the server; photos are fetched
// from `photoUrl`, which checks who is asking.
function complaintDto(doc, { counts = {}, myVote = null } = {}) {
  const hasPhoto = Boolean(doc.hasPhoto ?? (doc.photoPath || doc.photo));
  const hasResolutionPhoto = Boolean(doc.hasResolutionPhoto ?? (doc.resolutionPhotoPath || doc.resolutionPhoto));
  return {
    id: doc._id,
    citizenName: doc.citizenName,
    issueType: doc.issueType,
    category: doc.category ?? null,
    description: doc.description,
    location: doc.location,
    facilityType: doc.facilityType ?? null,
    facilityId: doc.facilityId ?? null,
    priority: doc.priority,
    status: doc.status,
    assignedWorkerId: doc.assignedWorkerId ?? null,
    assignedWorkerName: doc.assignedWorkerName ?? null,
    resolutionNote: doc.resolutionNote ?? "",
    hasPhoto,
    photoUrl: hasPhoto ? `/api/complaints/${doc._id}/photo` : null,
    hasResolutionPhoto,
    resolutionPhotoUrl: hasResolutionPhoto ? `/api/complaints/${doc._id}/resolution-photo` : null,
    upvotes: counts.up ?? 0,
    downvotes: counts.down ?? 0,
    myVote,
    isDemo: Boolean(doc.isDemo),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function notificationDto(doc) {
  return {
    id: String(doc._id),
    kind: doc.kind,
    message: doc.message,
    detail: doc.detail ?? "",
    complaintId: doc.complaintId ?? null,
    status: doc.status ?? null,
    requestId: doc.requestId ?? null,
    readAt: doc.readAt ?? null,
    createdAt: doc.createdAt,
  };
}

// The official's government profile defaults (the same as the app's).
export const DEFAULT_GOV_PROFILE = { state: "Uttarakhand", district: "Haridwar", ministry: "Ministry of Housing & Urban Affairs" };
const GOV_ROLES = ["official", "superadmin"];

function workerDto(doc) {
  return {
    id: doc._id,
    displayId: doc.displayId,
    name: doc.name,
    role: doc.role,
    area: doc.area,
    status: doc.status,
    phoneMasked: doc.phoneMasked ?? null,
    source: doc.source,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy ?? "",
    ...(doc.removedAt ? { removedAt: doc.removedAt, removedBy: doc.removedBy, removalReason: doc.removalReason } : {}),
  };
}

function ratingDto(doc) {
  return doc
    ? { toiletId: doc.toiletId, stars: doc.stars, categories: doc.categories ?? {}, comment: doc.comment ?? "", createdAt: doc.createdAt, updatedAt: doc.updatedAt }
    : null;
}

export function createCivicRepository({ db, client, nextId }) {
  const blobQueue = db.collection("blob_deletions");
  const profiles = db.collection("profiles");
  const workers = db.collection("workers");
  const complaints = db.collection("complaints");
  const votes = db.collection("complaint_votes");
  const notifications = db.collection("notifications");
  const ratings = db.collection("toilet_ratings");
  const consents = db.collection("consents");
  const users = db.collection("users");
  const locations = db.collection("locations");

  // Vote counts and the viewer's own vote for a page of complaints, in two queries.
  async function voteInfo(ids, viewerId) {
    const counts = {};
    if (!ids.length) return { counts, mine: {} };
    for (const row of await votes
      .aggregate([{ $match: { complaintId: { $in: ids } } }, { $group: { _id: { c: "$complaintId", d: "$direction" }, n: { $sum: 1 } } }])
      .toArray()) {
      (counts[row._id.c] ??= {})[row._id.d] = row.n;
    }
    const mine = {};
    if (viewerId) {
      for (const v of await votes.find({ complaintId: { $in: ids }, userId: viewerId }).toArray()) mine[v.complaintId] = v.direction;
    }
    return { counts, mine };
  }

  async function withVotes(docs, viewerId, options) {
    const { counts, mine } = await voteInfo(docs.map((d) => d._id), viewerId);
    return docs.map((d) => complaintDto(d, { ...options, counts: counts[d._id], myVote: mine[d._id] ?? null }));
  }

  const ratingSummaries = async (match) => {
    const totals = await ratings
      .aggregate([{ $match: match }, { $group: { _id: "$toiletId", average: { $avg: "$stars" }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
      .toArray();
    const perCategory = await ratings
      .aggregate([
        { $match: match },
        { $project: { toiletId: 1, c: { $objectToArray: "$categories" } } },
        { $unwind: "$c" },
        { $group: { _id: { t: "$toiletId", k: "$c.k" }, average: { $avg: "$c.v" }, count: { $sum: 1 } } },
        { $sort: { "_id.k": 1 } },
      ])
      .toArray();
    const categories = {};
    for (const row of perCategory) (categories[row._id.t] ??= {})[row._id.k] = { average: round1(row.average), count: row.count };
    return totals.map((s) => ({ toiletId: s._id, average: round1(s.average), count: s.count, categories: categories[s._id] ?? {} }));
  };

  return {
    // ---- complaints ------------------------------------------------------

    /**
     * Creates a complaint. A facility report must name a live bin/toilet of
     * that type; its location is copied from it. A second open report by the
     * same user on the same facility and category throws ConflictError with
     * the existing id — enforced by a unique index, so simultaneous reports
     * can't both get in.
     */
    async createComplaint(data, { uid, name }) {
      let location = data.location;
      if (data.facilityId) {
        const facility = await locations.findOne({ _id: data.facilityId, type: FACILITY_LOCATION_TYPE[data.facilityType], deletedAt: null });
        if (!facility) throw new ValidationError({ facilityId: `No ${data.facilityType} with that id.` });
        location = { address: facility.address || facility.name, latitude: facility.latitude, longitude: facility.longitude };
      }
      const openKey = data.facilityId ? `${uid}|${data.facilityId}|${data.category}` : null;
      const duplicate = async () => {
        const existing = await complaints.findOne({ openKey }, { projection: { _id: 1 } });
        return new ConflictError("You already reported this and it is still open.", { existingId: existing?._id ?? null });
      };
      if (openKey && (await complaints.findOne({ openKey }, { projection: { _id: 1 } }))) throw await duplicate();

      const ts = now();
      const doc = {
        _id: await nextId("SSB2026-", "complaints", 4),
        citizenId: uid,
        citizenName: name,
        issueType: data.issueType,
        category: data.category,
        description: data.description,
        location,
        facilityType: data.facilityType,
        facilityId: data.facilityId,
        priority: data.priority,
        photoPath: data.photoPath ?? null,
        status: COMPLAINT_STATUS.SUBMITTED,
        assignedWorkerId: null,
        assignedWorkerName: null,
        assignedWorkerUid: null,
        resolutionNote: "",
        resolutionPhotoPath: null,
        openKey,
        isDemo: false,
        createdAt: ts,
        updatedAt: ts,
      };
      try {
        await complaints.insertOne(doc);
      } catch (err) {
        if (isDuplicateKey(err) && err.keyPattern?.openKey) throw await duplicate();
        throw err;
      }
      return complaintDto(doc);
    },

    /** A page of complaints matching `scope` (who may see them) and `filters`, without photos. */
    async listComplaints(scope, filters, { skip, limit }, viewerId) {
      const match = { ...scope, ...filters };
      const [total, docs] = await Promise.all([
        complaints.countDocuments(match),
        complaints.aggregate(complaintListPipeline(match, { skip, limit })).toArray(),
      ]);
      return { total, items: await withVotes(docs, viewerId) };
    },

    /** One complaint if `scope` allows; otherwise null (a 404 for the caller). */
    async getComplaint(id, scope, viewerId) {
      const doc = await complaints.findOne({ _id: id, ...scope }, { projection: { photo: 0, resolutionPhoto: 0 } });
      return doc ? (await withVotes([doc], viewerId))[0] : null;
    },

    /**
     * Where a complaint's photo is, if `scope` lets this user see the
     * complaint: { pathname } in the Blob store, or { legacy } for a base64
     * photo not migrated yet. null otherwise.
     */
    async getComplaintPhotoRef(id, scope, which) {
      const [pathField, legacyField] = which === "resolution" ? ["resolutionPhotoPath", "resolutionPhoto"] : ["photoPath", "photo"];
      const doc = await complaints.findOne({ _id: id, ...scope }, { projection: { [pathField]: 1, [legacyField]: 1 } });
      if (doc?.[pathField]) return { pathname: doc[pathField] };
      if (typeof doc?.[legacyField] === "string") return { legacy: doc[legacyField] };
      return null;
    },

    /** Deletes a complaint and its votes and notifications. Returns its photo pathnames, or null if none existed. */
    async deleteComplaint(id) {
      const doc = await complaints.findOneAndDelete({ _id: id });
      if (!doc) return null;
      await votes.deleteMany({ complaintId: id });
      await notifications.deleteMany({ complaintId: id });
      return [doc.photoPath, doc.resolutionPhotoPath].filter(Boolean);
    },

    async getComplaintRaw(id) {
      return complaints.findOne({ _id: id });
    },

    /** An account with the worker role linked to this worker id, or null. */
    /**
     * An account with the worker role linked to this worker id, or null. A
     * worker an official has removed from the directory is not active.
     */
    async findActiveWorker(workerId) {
      if (await workers.findOne({ _id: workerId, removedAt: { $ne: null } }, { projection: { _id: 1 } })) return null;
      return users.findOne({ role: "worker", workerId }, { projection: { uid: 1, name: 1, workerId: 1 } });
    },

    // ---- profile -------------------------------------------------------------

    /** Officials: name + government profile (defaults until saved). Others: just a name. */
    async getProfile(user) {
      if (!GOV_ROLES.includes(user.role)) return { name: user.name };
      const doc = await profiles.findOne({ _id: user.uid });
      return {
        name: user.name,
        state: doc?.state ?? DEFAULT_GOV_PROFILE.state,
        district: doc?.district ?? DEFAULT_GOV_PROFILE.district,
        ministry: doc?.ministry ?? DEFAULT_GOV_PROFILE.ministry,
      };
    },

    /** Saves the fields given; the name is the account's display name. */
    async updateProfile(user, { name, ...fields }) {
      const ts = now();
      if (name !== undefined) await users.updateOne({ uid: user.uid }, { $set: { name, updatedAt: ts } });
      if (Object.keys(fields).length) {
        await profiles.updateOne({ _id: user.uid }, { $set: { ...fields, updatedAt: ts } }, { upsert: true });
      }
      return this.getProfile({ ...user, name: name ?? user.name });
    },

    // ---- worker directory ------------------------------------------------------

    async pageWorkers({ removed = false }, { skip, limit }) {
      const match = removed ? { removedAt: { $ne: null } } : { removedAt: null };
      const sort = removed ? { removedAt: -1, _id: -1 } : { displayId: 1, _id: 1 };
      const [total, docs] = await Promise.all([
        workers.countDocuments(match),
        workers.find(match).sort(sort).skip(skip).limit(limit).toArray(),
      ]);
      return { total, items: docs.map(workerDto) };
    },

    /** Seeding: the demo directory entries, unless they exist. */
    async insertWorkerIfMissing(w) {
      const doc = { displayId: w.displayId, name: w.name, role: w.role, area: w.area, status: w.status, phoneMasked: w.phoneMasked ?? null, source: "DEMO", createdAt: now(), createdBy: "system", createdById: null, removedAt: null, removedBy: null, removedById: null, removalReason: null };
      await workers.updateOne({ _id: w.id }, { $setOnInsert: doc }, { upsert: true });
    },

    async addWorker(data, actor) {
      const id = await nextId("gw-", "workers", 1);
      const n = Number(id.slice(3));
      const doc = {
        _id: id,
        displayId: `W${String(n).padStart(3, "0")}`,
        ...data,
        source: "GOVERNMENT",
        createdAt: now(),
        createdBy: actor.name,
        createdById: actor.uid,
        removedAt: null,
        removedBy: null,
        removedById: null,
        removalReason: null,
      };
      await workers.insertOne(doc);
      return workerDto(doc);
    },

    /** Takes a worker off the directory (reversible). null if missing or already removed. */
    async removeWorker(id, actor, reason) {
      const doc = await workers.findOneAndUpdate(
        { _id: id, removedAt: null },
        { $set: { removedAt: now(), removedBy: actor.name, removedById: actor.uid, removalReason: reason } },
        { returnDocument: "after" }
      );
      return doc ? workerDto(doc) : null;
    },

    async restoreWorker(id) {
      const doc = await workers.findOneAndUpdate(
        { _id: id, removedAt: { $ne: null } },
        { $set: { removedAt: null, removedBy: null, removedById: null, removalReason: null } },
        { returnDocument: "after" }
      );
      return doc ? workerDto(doc) : null;
    },

    async getComplaintPhotoPaths(id) {
      const doc = await complaints.findOne({ _id: id }, { projection: { photoPath: 1, resolutionPhotoPath: 1 } });
      return doc ? [doc.photoPath, doc.resolutionPhotoPath].filter(Boolean) : [];
    },

    /** Assigns (or re-assigns) while not yet started. Returns the complaint, or null if the status doesn't allow it. */
    async assignComplaint(id, { workerId, workerName, workerUid }) {
      const doc = await complaints.findOneAndUpdate(
        { _id: id, status: { $in: ASSIGNABLE_STATUSES } },
        {
          $set: {
            status: COMPLAINT_STATUS.ASSIGNED,
            assignedWorkerId: workerId,
            assignedWorkerName: workerName,
            assignedWorkerUid: workerUid,
            updatedAt: now(),
          },
        },
        { returnDocument: "after" }
      );
      return doc ? (await withVotes([doc], null))[0] : null;
    },

    /**
     * Moves a complaint from `from` to `to`, only if it is still in `from` and
     * assigned to `workerId` (a conditional update, so two requests racing
     * can't both succeed). Returns the complaint, or null if it had moved on.
     */
    async transitionComplaint(id, { from, to, workerId, set = {} }) {
      const update = { status: to, ...set, updatedAt: now() };
      if (to === COMPLAINT_STATUS.RESOLVED) update.openKey = null; // a new report may follow
      const doc = await complaints.findOneAndUpdate(
        { _id: id, status: from, assignedWorkerId: workerId },
        { $set: update },
        { returnDocument: "after" }
      );
      return doc ? (await withVotes([doc], null))[0] : null;
    },

    async setComplaintPriority(id, priority) {
      const doc = await complaints.findOneAndUpdate({ _id: id }, { $set: { priority, updatedAt: now() } }, { returnDocument: "after" });
      return doc ? (await withVotes([doc], null))[0] : null;
    },

    /** One vote per user per complaint (unique index). `direction` null removes it. */
    async voteComplaint(complaintId, userId, direction) {
      if (direction === null) {
        await votes.deleteOne({ complaintId, userId });
      } else {
        const ts = now();
        const write = () =>
          votes.updateOne({ complaintId, userId }, { $set: { direction, updatedAt: ts }, $setOnInsert: { createdAt: ts } }, { upsert: true });
        try {
          await write();
        } catch (err) {
          if (!isDuplicateKey(err)) throw err;
          await write(); // a simultaneous vote created it first: update that one
        }
      }
    },

    async openComplaintCount(facilityId) {
      return complaints.countDocuments({ facilityId, status: { $ne: COMPLAINT_STATUS.RESOLVED } });
    },

    // ---- the map -------------------------------------------------------------

    /**
     * Every live bin and toilet with only what the map draws, plus each
     * toilet's rating average, in one aggregation. At most `limit`;
     * `truncated` says if there were more.
     */
    async mapLocations(limit) {
      const match = { deletedAt: null, type: { $in: ["dustbin", "public_toilet"] } };
      const [total, docs] = await Promise.all([
        locations.countDocuments(match),
        locations
          .aggregate([
            { $match: match },
            { $sort: { _id: 1 } },
            { $limit: limit },
            {
              $lookup: {
                from: "toilet_ratings",
                localField: "_id",
                foreignField: "toiletId",
                pipeline: [{ $group: { _id: null, average: { $avg: "$stars" } } }],
                as: "rating",
              },
            },
            {
              $project: {
                _id: 0,
                id: "$_id",
                type: 1,
                status: 1,
                statusSource: 1,
                latitude: 1,
                longitude: 1,
                name: 1,
                isDemo: 1,
                ratingAverage: { $ifNull: [{ $first: "$rating.average" }, null] },
              },
            },
          ])
          .toArray(),
      ]);
      const items = docs.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        // Bins only: "manual" statuses are never changed by the app's demo simulation.
        statusSource: d.type === "dustbin" ? (d.statusSource ?? "simulated") : null,
        latitude: d.latitude,
        longitude: d.longitude,
        name: d.name,
        isDemo: Boolean(d.isDemo),
        ratingAverage: d.ratingAverage === null ? null : round1(d.ratingAverage),
      }));
      return { total, truncated: total > items.length, items };
    },

    // ---- blob deletions that failed ---------------------------------------------

    /** Remembers blobs whose delete failed, for the daily retry. Never throws. */
    async queueBlobDeletions(pathnames, error) {
      const ts = now();
      for (const pathname of pathnames) {
        try {
          await blobQueue.updateOne(
            { _id: pathname },
            { $inc: { attempts: 1 }, $set: { lastError: String(error ?? "").slice(0, 300), updatedAt: ts }, $setOnInsert: { createdAt: ts } },
            { upsert: true }
          );
        } catch (err) {
          console.error(`[blob-queue] could not queue ${pathname}:`, err?.message ?? err);
        }
      }
    },

    /** Tries the queued deletes again. Returns { deleted, stillQueued }. */
    async retryBlobDeletions(store, limit = 500) {
      const queued = await blobQueue.find({}).sort({ createdAt: 1 }).limit(limit).toArray();
      let deleted = 0;
      for (const row of queued) {
        try {
          await store.del([row._id]);
          await blobQueue.deleteOne({ _id: row._id });
          deleted += 1;
        } catch (err) {
          await blobQueue.updateOne({ _id: row._id }, { $inc: { attempts: 1 }, $set: { lastError: String(err?.message ?? err).slice(0, 300), updatedAt: now() } });
        }
      }
      return { deleted, stillQueued: await blobQueue.countDocuments() };
    },

    // ---- notifications ---------------------------------------------------

    async notify({ userId, kind, message, detail = "", complaintId = null, status = null, requestId = null }) {
      if (!userId || userId === DELETED_USER_ID) return;
      await notifications.insertOne({
        userId,
        kind,
        message: message.slice(0, 200),
        detail: (detail ?? "").slice(0, 300),
        complaintId,
        status,
        requestId,
        readAt: null,
        createdAt: now(),
      });
    },

    async listNotifications(userId, { skip, limit }) {
      const match = { userId };
      const [total, unread, docs] = await Promise.all([
        notifications.countDocuments(match),
        notifications.countDocuments({ userId, readAt: null }),
        notifications.find(match).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
      ]);
      return { total, unread, items: docs.map(notificationDto) };
    },

    /** Marks one of the user's own notifications read; null if it isn't theirs (or doesn't exist). */
    async markNotificationRead(userId, id) {
      if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id) return null;
      const doc = await notifications.findOneAndUpdate(
        { _id: new ObjectId(id), userId },
        [{ $set: { readAt: { $ifNull: ["$readAt", now()] } } }],
        { returnDocument: "after" }
      );
      return doc ? notificationDto(doc) : null;
    },

    async markAllNotificationsRead(userId) {
      const res = await notifications.updateMany({ userId, readAt: null }, { $set: { readAt: now() } });
      return res.modifiedCount;
    },

    // ---- toilet ratings ----------------------------------------------------

    async isLiveToilet(id) {
      return Boolean(await locations.findOne({ _id: id, type: "public_toilet", deletedAt: null }, { projection: { _id: 1 } }));
    },

    /** One rating per user per toilet (unique index): rating again replaces it. */
    async upsertRating(toiletId, userId, { stars, categories, comment }) {
      const ts = now();
      const write = () =>
        ratings.findOneAndUpdate(
          { toiletId, userId },
          { $set: { stars, categories, comment, updatedAt: ts }, $setOnInsert: { createdAt: ts } },
          { upsert: true, returnDocument: "after" }
        );
      try {
        return ratingDto(await write());
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        return ratingDto(await write());
      }
    },

    async getRating(toiletId, userId) {
      return ratingDto(await ratings.findOne({ toiletId, userId }));
    },

    /** Recent ratings for one toilet, without who wrote them. */
    async listRatings(toiletId, { skip, limit }) {
      const [total, docs] = await Promise.all([
        ratings.countDocuments({ toiletId }),
        ratings.find({ toiletId }).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
      ]);
      return { total, items: docs.map((d) => ({ stars: d.stars, categories: d.categories ?? {}, comment: d.comment ?? "", updatedAt: d.updatedAt })) };
    },

    /** Averages (one decimal) and counts, overall and per category, computed by MongoDB. */
    async ratingSummary(toiletId) {
      return (await ratingSummaries({ toiletId }))[0] ?? { toiletId, average: null, count: 0, categories: {} };
    },

    async ratingSummaries(toiletIds) {
      return ratingSummaries({ toiletId: { $in: toiletIds } });
    },

    /** Live toilets averaging below 3 stars with at least 3 ratings, worst first. */
    async lowRatedToilets({ skip, limit }) {
      const [result] = await ratings
        .aggregate([
          { $group: { _id: "$toiletId", average: { $avg: "$stars" }, count: { $sum: 1 } } },
          { $match: { average: { $lt: 3 }, count: { $gte: 3 } } },
          { $lookup: { from: "locations", localField: "_id", foreignField: "_id", as: "toilet" } },
          { $unwind: "$toilet" },
          { $match: { "toilet.type": "public_toilet", "toilet.deletedAt": null } },
          { $sort: { average: 1, _id: 1 } },
          {
            $facet: {
              total: [{ $count: "n" }],
              items: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 0, toiletId: "$_id", name: "$toilet.name", average: 1, count: 1 } }],
            },
          },
        ])
        .toArray();
      return { total: result.total[0]?.n ?? 0, items: result.items.map((s) => ({ ...s, average: round1(s.average) })) };
    },

    // ---- consent -------------------------------------------------------------

    async getConsent(uid) {
      const doc = await consents.findOne({ _id: uid });
      return doc ? { version: doc.version, acceptedAt: doc.acceptedAt, items: doc.items } : null;
    },

    async saveConsent(uid, { version, items }) {
      const ts = now();
      await consents.replaceOne({ _id: uid }, { _id: uid, version, acceptedAt: ts, items, updatedAt: ts }, { upsert: true });
      return { version, acceptedAt: ts, items };
    },

    /** Clears the privacy consent of every demo account (presentations). Returns how many. */
    async resetDemoConsents() {
      const demoIds = (await users.find({ isDemo: true }, { projection: { uid: 1 } }).toArray()).map((u) => u.uid);
      if (!demoIds.length) return 0;
      return (await consents.deleteMany({ _id: { $in: demoIds } })).deletedCount;
    },

    /** Withdraws consent and ends every session of the user, including live access tokens. */
    async withdrawConsent(uid) {
      await consents.deleteOne({ _id: uid });
      await users.updateOne({ uid }, { $set: { sessionsRevokedAt: now() } });
      await db.collection("refresh_tokens").updateMany({ uid, revokedAt: null }, { $set: { revokedAt: new Date() } });
    },

    // ---- delete my data -------------------------------------------------------

    /**
     * Deletes the user's account, ratings, notifications, votes, consent and
     * sessions, and anonymises what the municipality keeps: their complaints
     * (no owner, "Deleted user", and no photo they attached), their facility
     * requests (owner unlinked, photo removed), and every record that shows
     * them as the official or worker who acted on it. Records are matched by
     * the stored user id, never by display name, so a namesake is untouched.
     * One transaction: all of it happens or none of it does.
     * Returns { deleted, anonymised, photoPaths } — the caller deletes those
     * blobs once the transaction has committed.
     * Throws { code: "demo_account" } for the shared demo users.
     */
    async deleteUserData(uid) {
      const user = await users.findOne({ uid });
      if (!user) return null;
      if (user.isDemo) throw Object.assign(new Error("demo_account"), { code: "demo_account" });
      const result = { deleted: {}, anonymised: {}, photoPaths: [] };
      const gone = { name: DELETED_USER_NAME, id: DELETED_USER_ID };

      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const o = { session };
          result.deleted.ratings = (await ratings.deleteMany({ userId: uid }, o)).deletedCount;
          result.deleted.notifications = (await notifications.deleteMany({ userId: uid }, o)).deletedCount;
          result.deleted.votes = (await votes.deleteMany({ userId: uid }, o)).deletedCount;
          result.deleted.consent = (await consents.deleteOne({ _id: uid }, o)).deletedCount;

          // Photos they attached go (the complaint itself is kept).
          const requests = db.collection("facility_requests");
          const ownComplaints = await complaints.find({ citizenId: uid }, { projection: { photoPath: 1 }, ...o }).toArray();
          const ownRequests = await requests.find({ requestedByUser: uid }, { projection: { photoPath: 1 }, ...o }).toArray();
          result.photoPaths = [...ownComplaints, ...ownRequests].map((d) => d.photoPath).filter(Boolean);
          result.deleted.photos = result.photoPaths.length;

          result.anonymised.complaints = (
            await complaints.updateMany(
              { citizenId: uid },
              { $set: { citizenId: null, citizenName: gone.name, openKey: null, photoPath: null }, $unset: { photo: "" } },
              o
            )
          ).modifiedCount;
          result.anonymised.facilityRequests = (
            await requests.updateMany(
              { requestedByUser: uid },
              { $set: { requestedByUser: gone.id, requestedByWorkerName: gone.name, photoPath: null }, $unset: { photo: "" } },
              o
            )
          ).modifiedCount;
          // Records showing them as the official or worker who acted — by id only.
          await complaints.updateMany({ assignedWorkerUid: uid }, { $set: { assignedWorkerName: gone.name, assignedWorkerUid: gone.id } }, o);
          await requests.updateMany({ reviewedById: uid }, { $set: { reviewedBy: gone.name, reviewedById: gone.id } }, o);
          await locations.updateMany({ createdById: uid }, { $set: { createdBy: gone.name, createdById: gone.id } }, o);
          await locations.updateMany({ deletedById: uid }, { $set: { deletedBy: gone.name, deletedById: gone.id } }, o);
          await workers.updateMany({ createdById: uid }, { $set: { createdBy: gone.name, createdById: gone.id } }, o);
          await workers.updateMany({ removedById: uid }, { $set: { removedBy: gone.name, removedById: gone.id } }, o);
          await profiles.deleteOne({ _id: uid }, o);
          await db.collection("refresh_tokens").deleteMany({ uid }, o);
          // rate-limit counters keyed by their id (they'd expire soon anyway)
          await db.collection("auth_rate_limits").deleteMany({ _id: { $in: [`complaint:${uid}`, `write:user:${uid}`, `auth:user:${uid}`, `geo:user:${uid}`] } }, o);
          if (user.phoneHash) await db.collection("pending_roles").deleteOne({ _id: user.phoneHash }, o);
          result.deleted.account = (await users.deleteOne({ uid }, o)).deletedCount;
        });
      } finally {
        await session.endSession();
      }
      return result;
    },
  };
}
