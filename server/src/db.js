// MongoDB persistence (official `mongodb` driver — the data is plain
// documents that map 1:1 to the API's JSON, so an ODM/schema layer would only
// add weight).
//
// Collections (one per former SQLite table, plus two for auth):
//   locations           _id = "DB-001" style id; soft-deleted via deletedAt
//   facility_requests   _id = "FR-2026-001" style id
//   users               one per Firebase uid: { uid, phone, role, name, workerId }
//   pending_roles       roles granted by an admin to a phone number that hasn't
//                       signed in yet (applied at first sign-in), _id = phone
//   refresh_tokens      SHA-256 hashes of issued refresh tokens (TTL-expired)
//   counters            per-prefix sequence for generated ids
//
// One shared connection is opened at start-up (connectDatabase) and every
// request reuses it. Every repository method is async.

import { MongoClient } from "mongodb";
import { REQUEST_FACILITY_TYPES, REQUEST_STATUS } from "./constants.js";

export class DatabaseError extends Error {}

// Human-readable reason for a failed connection. Never includes the URI, which
// holds the database password.
function explainConnectionError(err) {
  const text = `${err?.name ?? ""} ${err?.message ?? ""}`;
  if (/Authentication failed|bad auth|AuthenticationFailed/i.test(text) || err?.code === 18) {
    return "MongoDB rejected the username or password in MONGODB_URI.";
  }
  if (/Invalid scheme|Invalid connection string|MongoParseError|URI/i.test(text)) {
    return "MONGODB_URI isn't a valid MongoDB connection string (it should start with mongodb:// or mongodb+srv://).";
  }
  if (/ServerSelection|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timed out/i.test(text)) {
    return "Couldn't reach MongoDB. Check your internet connection and that your IP address is allowed in Atlas → Network Access.";
  }
  return `MongoDB connection failed (${err?.name ?? "unknown error"}).`;
}

/** Opens the single shared connection and makes sure the indexes exist. */
export async function connectDatabase({ uri, dbName }) {
  let client;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: "ecosetu-api" });
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    await ensureIndexes(db);
    return { client, db, close: () => client.close() };
  } catch (err) {
    await client?.close().catch(() => {});
    throw new DatabaseError(explainConnectionError(err));
  }
}

export async function ensureIndexes(db) {
  await Promise.all([
    db.collection("users").createIndexes([
      { key: { uid: 1 }, unique: true, name: "uid_unique" },
      { key: { phone: 1 }, unique: true, name: "phone_unique" },
      { key: { role: 1 }, name: "role" },
      { key: { createdAt: -1 }, name: "createdAt" },
    ]),
    db.collection("locations").createIndexes([
      { key: { deletedAt: 1, type: 1 }, name: "deleted_type" },
      { key: { status: 1 }, name: "status" },
      { key: { source: 1, isDemo: 1 }, name: "source_demo" },
      { key: { createdAt: -1 }, name: "createdAt" },
    ]),
    db.collection("facility_requests").createIndexes([
      { key: { status: 1 }, name: "status" },
      { key: { createdAt: -1 }, name: "createdAt" },
      { key: { requestedByUser: 1 }, name: "requestedByUser" },
      { key: { requestedByWorkerId: 1 }, name: "requestedByWorkerId" },
    ]),
    db.collection("refresh_tokens").createIndexes([
      { key: { tokenHash: 1 }, unique: true, name: "tokenHash_unique" },
      { key: { uid: 1 }, name: "uid" },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "expiresAt_ttl" },
    ]),
  ]);
}

const now = () => new Date().toISOString();

// A refresh token used again within this window is treated as two tabs racing
// (the second one just fails); only later reuse counts as theft.
const REUSE_GRACE_MS = 10_000;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isDuplicateKey = (err) => err?.code === 11000;

// ---- DTOs (identical JSON to what the SQLite version returned) -----------

function locationDto(doc) {
  return {
    id: doc._id,
    name: doc.name,
    type: doc.type,
    latitude: doc.latitude,
    longitude: doc.longitude,
    description: doc.description,
    address: doc.address,
    status: doc.status,
    details: doc.details ?? {},
    source: doc.source,
    requestId: doc.requestId ?? null,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    isDemo: Boolean(doc.isDemo),
  };
}

function removedDto(doc) {
  return {
    ...locationDto(doc),
    removedAt: doc.deletedAt,
    removedBy: doc.deletedBy,
    removalReason: doc.deleteReason,
  };
}

function requestDto(doc) {
  return {
    id: doc._id,
    facilityType: doc.facilityType,
    suggestedName: doc.suggestedName,
    location: { address: doc.address, latitude: doc.latitude, longitude: doc.longitude },
    reason: doc.reason,
    description: doc.description,
    priority: doc.priority,
    photo: doc.photo ?? null,
    status: doc.status,
    rejectionReason: doc.rejectionReason,
    requestedByWorkerId: doc.requestedByWorkerId,
    requestedByWorkerName: doc.requestedByWorkerName,
    reviewedBy: doc.reviewedBy ?? null,
    isDemo: Boolean(doc.isDemo),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function userDto(doc) {
  return doc
    ? { uid: doc.uid, phone: doc.phone, role: doc.role, name: doc.name, workerId: doc.workerId ?? null }
    : null;
}

// ---- repository ----------------------------------------------------

const ID_PREFIX = { dustbin: "DB-", public_toilet: "PT-" };
const idPrefix = (type) => ID_PREFIX[type] ?? (type === "campus" ? "CP-" : "BL-");

/**
 * `session` is set only on the transaction-bound copy handed to
 * repo.transaction(fn); everything else uses the plain repository.
 */
export function createRepository(db, client, session = null) {
  const locations = db.collection("locations");
  const requests = db.collection("facility_requests");
  const users = db.collection("users");
  const refreshTokens = db.collection("refresh_tokens");
  const counters = db.collection("counters");
  const pendingRoles = db.collection("pending_roles");
  const opts = session ? { session } : {};

  // Atomic per-prefix sequence. The counter starts from the highest id that
  // already exists, so ids from seeds or imports are never reused. Counter
  // writes are deliberately outside any transaction (gaps are harmless).
  const nextId = async (prefix, collection) => {
    if (!(await counters.findOne({ _id: prefix }))) {
      const rows = await db
        .collection(collection)
        .find({ _id: { $regex: `^${escapeRegExp(prefix)}` } }, { projection: { _id: 1 } })
        .toArray();
      const max = rows
        .map((r) => parseInt(r._id.slice(prefix.length), 10))
        .filter((n) => Number.isFinite(n))
        .reduce((a, b) => Math.max(a, b), 0);
      try {
        await counters.insertOne({ _id: prefix, seq: max });
      } catch (err) {
        if (!isDuplicateKey(err)) throw err; // another request initialised it first
      }
    }
    const doc = await counters.findOneAndUpdate({ _id: prefix }, { $inc: { seq: 1 } }, { returnDocument: "after" });
    return `${prefix}${String(doc.seq).padStart(3, "0")}`;
  };

  const insertLocation = async (loc) => {
    const id = loc.id ?? (await nextId(idPrefix(loc.type), "locations"));
    const ts = loc.createdAt ?? now();
    await locations.insertOne(
      {
        _id: id,
        name: loc.name,
        type: loc.type,
        latitude: loc.latitude,
        longitude: loc.longitude,
        description: loc.description ?? "",
        address: loc.address ?? "",
        status: loc.status,
        details: loc.details ?? {},
        source: loc.source,
        requestId: loc.requestId ?? null,
        createdBy: loc.createdBy,
        createdAt: ts,
        updatedAt: loc.updatedAt ?? ts,
        isDemo: Boolean(loc.isDemo),
        deletedAt: null,
        deletedBy: null,
        deleteReason: null,
      },
      opts
    );
    return id;
  };

  const insertRequest = async (r) => {
    const id = r.id ?? (await nextId("FR-2026-", "facility_requests"));
    const ts = r.createdAt ?? now();
    await requests.insertOne(
      {
        _id: id,
        facilityType: r.facilityType,
        suggestedName: r.suggestedName,
        address: r.address,
        latitude: r.latitude,
        longitude: r.longitude,
        reason: r.reason,
        description: r.description ?? "",
        priority: r.priority,
        photo: r.photo ?? null,
        status: r.status ?? REQUEST_STATUS.PENDING,
        rejectionReason: r.rejectionReason ?? "",
        requestedByUser: r.requestedByUser,
        requestedByWorkerId: r.requestedByWorkerId,
        requestedByWorkerName: r.requestedByWorkerName ?? "",
        reviewedBy: r.reviewedBy ?? null,
        isDemo: Boolean(r.isDemo),
        createdAt: ts,
        updatedAt: r.updatedAt ?? ts,
      },
      opts
    );
    return id;
  };

  // Turns an approved request into a real, map-visible location.
  const publishRequest = async (req, approver) => {
    const type = REQUEST_FACILITY_TYPES[req.facilityType];
    const details =
      type === "dustbin"
        ? { wasteType: "Mixed Waste", fillLevel: 0 }
        : { openingHours: "Not specified yet", cleanliness: 3, facilities: ["Men", "Women"] };
    return insertLocation({
      name: req.suggestedName,
      type,
      latitude: req.latitude,
      longitude: req.longitude,
      description: req.isDemo ? `DEMO — ${req.reason}` : req.reason,
      address: req.address,
      status: type === "dustbin" ? "normal" : "Open",
      details,
      source: "worker_approved",
      requestId: req.id ?? req._id,
      createdBy: approver,
      isDemo: Boolean(req.isDemo),
    });
  };

  const repo = {
    // ---- users & sessions --------------------------------------------
    async getUserByUid(uid) {
      return userDto(await users.findOne({ uid }, opts));
    },

    /**
     * Signs a Firebase uid in. An existing user keeps their stored role (only
     * the phone/name are refreshed). A first-time user gets the role an admin
     * pre-granted for their phone number (see grantRole), otherwise "citizen" —
     * never anything a client asked for. Throws { code: "phone_taken" } if the
     * phone number already belongs to a different uid.
     */
    async upsertUser({ uid, phone, name }) {
      const ts = now();
      const pending = await pendingRoles.findOne({ _id: phone }, opts);
      const set = { phone, updatedAt: ts };
      const onInsert = {
        uid,
        createdAt: ts,
        role: pending?.role ?? "citizen",
        workerId: pending?.workerId ?? null,
      };
      if (name) set.name = name;
      else onInsert.name = onInsert.role;
      try {
        await users.updateOne({ uid }, { $set: set, $setOnInsert: onInsert }, { upsert: true, ...opts });
      } catch (err) {
        if (isDuplicateKey(err)) throw Object.assign(new Error("phone_taken"), { code: "phone_taken" });
        throw err;
      }
      if (pending) await pendingRoles.deleteOne({ _id: phone }, opts);
      return this.getUserByUid(uid);
    },

    /**
     * Admin operation (npm run grant-role): sets the role of the user with this
     * phone number. If nobody has signed in with it yet, the role is stored as
     * pending and applied at their first sign-in.
     * Returns { status: "updated" | "pending" }.
     */
    async grantRole({ phone, role, workerId = null }) {
      const ts = now();
      const res = await users.updateOne(
        { phone },
        { $set: { role, workerId, updatedAt: ts } },
        opts
      );
      if (res.matchedCount) {
        await pendingRoles.deleteOne({ _id: phone }, opts);
        return { status: "updated" };
      }
      await pendingRoles.updateOne(
        { _id: phone },
        { $set: { role, workerId, updatedAt: ts }, $setOnInsert: { createdAt: ts } },
        { upsert: true, ...opts }
      );
      return { status: "pending" };
    },

    async saveRefreshToken({ uid, tokenHash, expiresAt }) {
      await refreshTokens.insertOne({ uid, tokenHash, expiresAt, createdAt: new Date(), revokedAt: null });
    },

    /**
     * Single-use: atomically marks a valid refresh token as used and returns
     * its owner uid. If the token was already used a while ago (replayed —
     * possibly stolen), every refresh token of that user is revoked and null is
     * returned.
     */
    async consumeRefreshToken(tokenHash) {
      const at = new Date();
      const doc = await refreshTokens.findOneAndUpdate(
        { tokenHash, revokedAt: null, expiresAt: { $gt: at } },
        { $set: { revokedAt: at } },
        { returnDocument: "before" }
      );
      if (doc) return doc.uid;
      const used = await refreshTokens.findOne({ tokenHash });
      const justRotated = used?.revokedAt && at - used.revokedAt < REUSE_GRACE_MS;
      if (used && !justRotated) {
        await refreshTokens.updateMany({ uid: used.uid, revokedAt: null }, { $set: { revokedAt: at } });
      }
      return null;
    },

    async revokeRefreshToken(tokenHash) {
      await refreshTokens.updateOne({ tokenHash, revokedAt: null }, { $set: { revokedAt: new Date() } });
    },

    // ---- locations ----------------------------------------------------
    async listLocations({ type, q } = {}) {
      const rows = await locations.find({ deletedAt: null }, opts).sort({ _id: 1 }).toArray();
      const needle = q ? q.toLowerCase() : null;
      return rows
        .filter((r) => !type || r.type === type)
        .filter(
          (r) =>
            !needle ||
            r.name.toLowerCase().includes(needle) ||
            r.address.toLowerCase().includes(needle) ||
            r.description.toLowerCase().includes(needle) ||
            r._id.toLowerCase().includes(needle)
        )
        .map(locationDto);
    },
    async listRemoved() {
      const rows = await locations
        .find({ deletedAt: { $ne: null } }, opts)
        .sort({ deletedAt: -1 })
        .toArray();
      return rows.map(removedDto);
    },
    async getLocation(id) {
      const doc = await locations.findOne({ _id: id, deletedAt: null }, opts);
      return doc ? locationDto(doc) : null;
    },
    async createLocation(data, actor) {
      const id = await insertLocation({ ...data, source: "government", createdBy: actor, isDemo: false });
      return locationDto(await locations.findOne({ _id: id }, opts));
    },
    async updateLocation(id, data) {
      await locations.updateOne(
        { _id: id, deletedAt: null },
        {
          $set: {
            name: data.name,
            type: data.type,
            latitude: data.latitude,
            longitude: data.longitude,
            description: data.description,
            address: data.address,
            status: data.status,
            details: data.details ?? {},
            updatedAt: now(),
          },
        },
        opts
      );
      return this.getLocation(id);
    },
    async softDelete(id, actor, reason) {
      const res = await locations.updateOne(
        { _id: id, deletedAt: null },
        { $set: { deletedAt: now(), deletedBy: actor, deleteReason: reason } },
        opts
      );
      return res.modifiedCount > 0;
    },
    async restore(id) {
      const res = await locations.updateOne(
        { _id: id, deletedAt: { $ne: null } },
        { $set: { deletedAt: null, deletedBy: null, deleteReason: null, updatedAt: now() } },
        opts
      );
      if (!res.modifiedCount) return null;
      return locationDto(await locations.findOne({ _id: id }, opts));
    },
    countLocations() {
      return locations.countDocuments({}, opts);
    },
    insertLocation,

    // ---- facility requests --------------------------------------------
    async listRequests({ userSub, workerId, all }) {
      const rows = await requests.find({}, opts).sort({ createdAt: -1 }).toArray();
      return rows
        .filter(
          (r) =>
            all ||
            r.requestedByUser === userSub ||
            // Seeded demo requests have no real login behind them; they are
            // visible to the demo worker whose id they carry.
            (r.isDemo && workerId && r.requestedByWorkerId === workerId)
        )
        .map(requestDto);
    },
    async getRequest(id) {
      const doc = await requests.findOne({ _id: id }, opts);
      return doc ? requestDto(doc) : null;
    },
    async getRequestOwner(id) {
      const doc = await requests.findOne(
        { _id: id },
        { projection: { requestedByUser: 1, requestedByWorkerId: 1, isDemo: 1 }, ...opts }
      );
      return doc
        ? {
            requestedByUser: doc.requestedByUser,
            requestedByWorkerId: doc.requestedByWorkerId,
            isDemo: Boolean(doc.isDemo),
          }
        : null;
    },
    async createRequest(data, userSub) {
      const id = await insertRequest({ ...data, requestedByUser: userSub, isDemo: false });
      return this.getRequest(id);
    },
    insertRequest,

    /**
     * Moves a request to a new status. Approving it also publishes the
     * facility, in the same transaction, so a request can never end up
     * approved without its location (or the reverse).
     * Returns { request, location? } or { error: "not_found" | "finalised" }.
     */
    setRequestStatus(id, status, { actor, rejectionReason = "" }) {
      return repo.transaction(async (tx) => {
        const doc = await requests.findOne({ _id: id }, { session: tx.session });
        if (!doc) return { error: "not_found" };
        if (doc.status === REQUEST_STATUS.APPROVED || doc.status === REQUEST_STATUS.REJECTED) {
          return { error: "finalised", current: doc.status };
        }
        await requests.updateOne(
          { _id: id },
          {
            $set: {
              status,
              rejectionReason: status === REQUEST_STATUS.REJECTED ? rejectionReason : "",
              reviewedBy: actor,
              updatedAt: now(),
            },
          },
          { session: tx.session }
        );
        let location = null;
        if (status === REQUEST_STATUS.APPROVED) {
          const locId = await tx.publishRequest({ ...doc, id }, actor);
          location = locationDto(await locations.findOne({ _id: locId }, { session: tx.session }));
        }
        return { request: requestDto(await requests.findOne({ _id: id }, { session: tx.session })), location };
      });
    },
    publishRequest,
    countRequests() {
      return requests.countDocuments({}, opts);
    },

    /** Runs fn(tx) in a MongoDB transaction; tx is this repository bound to it. */
    async transaction(fn) {
      if (session) return fn(repo);
      let result;
      await client.withSession(async (s) => {
        await s.withTransaction(async () => {
          result = await fn(createRepository(db, client, s));
        });
      });
      return result;
    },
    session,
  };
  return repo;
}
