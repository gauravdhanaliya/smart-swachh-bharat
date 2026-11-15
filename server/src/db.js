// MongoDB persistence (official `mongodb` driver — the data is plain
// documents that map 1:1 to the API's JSON, so an ODM/schema layer would only
// add weight).
//
// Collections (validators and indexes in schemas.js):
//   locations           _id = "DB-001" style id; soft-deleted via deletedAt
//   facility_requests   _id = "FR-2026-001" style id
//   users               one per Firebase uid: { uid, role, name, workerId, isDemo,
//                       authProvider, emailHash, emailMasked, emailVerified }.
//                       Citizens are anonymous (no email). A saved account
//                       has a keyed hash + masked copy of its email — never
//                       the address itself. No phone numbers.
//   pending_roles       roles granted by an admin to the email of an account
//                       that isn't verified or hasn't signed in yet (applied
//                       once it signs in with that email verified), _id = email hash
//   refresh_tokens      SHA-256 hashes of issued refresh tokens (TTL-expired)
//   auth_rate_limits    request counters shared by every instance (TTL-expired)
//   complaints, toilet_ratings, notifications, consents   (used from Phase 3)
//   counters            per-prefix sequence for generated ids
//
// One shared connection is opened at start-up (connectDatabase) and every
// request reuses it. Every repository method is async.

import { MongoClient } from "mongodb";
import { requestIdPrefix } from "./ids.js";
import { BIN_STATUSES, REQUEST_FACILITY_TYPES, REQUEST_STATUS, migrateBinLocation } from "./constants.js";
import { hashEmail, maskEmail } from "./identity.js";
import { ensureCollections } from "./schemas.js";
import { createCivicRepository } from "./civic.js";
import { decodePhoto, migratedPhotoPathname } from "./photoStore.js";

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

// The first error in the chain that carries a server error code
// (MongoServerError, or one wrapped as `cause` / `reason`).
function serverErrorIn(err) {
  const seen = new Set();
  for (let e = err; e && typeof e === "object" && !seen.has(e); e = e.cause ?? e.reason) {
    seen.add(e);
    if (typeof e.code === "number" || e.codeName) return e;
  }
  return null;
}

// Every piece of MONGODB_URI that could identify the account: the whole URI,
// the username and the password (as written and percent-decoded).
function uriSecrets(uri) {
  const out = [];
  if (!uri) return out;
  out.push(uri);
  const m = /^mongodb(?:\+srv)?:\/\/([^@/]*)@/i.exec(uri);
  if (m) {
    const [user, pass] = m[1].split(":");
    for (const part of [user, pass]) {
      if (!part) continue;
      out.push(part);
      try {
        out.push(decodeURIComponent(part));
      } catch {
        /* not percent-encoded */
      }
    }
  }
  return [...new Set(out)].filter((s) => s.length >= 3).sort((a, b) => b.length - a.length);
}

/** `text` with the URI, username and password removed. */
export function redactUri(text, uri) {
  let out = String(text ?? "");
  for (const secret of uriSecrets(uri)) out = out.split(secret).join("***");
  // Any other connection string (e.g. one echoed back by the driver).
  return out.replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, "mongodb$1://***");
}

/**
 * One line for a failed MongoDB operation, for the admin scripts and server
 * logs: the error class, the server's code and codeName (8000 AtlasError,
 * 13 Unauthorized, 18 AuthenticationFailed …), the command that failed and the
 * server's reason. Never the URI, username or password; a command document
 * echoed in the message (it can hold session ids and cluster-time signatures)
 * is cut off.
 */
export function describeMongoError(err, { uri, failedCommand } = {}) {
  const server = serverErrorIn(err);
  const parts = [err?.name ?? "Error"];
  if (server) {
    const codeName = server.codeName ?? server.errorResponse?.codeName;
    parts.push(`code ${server.code ?? "?"}${codeName ? ` (${codeName})` : ""}`);
  }
  // The recorded command only if it failed with this same code (a failure the
  // code tolerated earlier, e.g. NamespaceExists, must not be blamed).
  const recorded = failedCommand && server && failedCommand.code === server.code ? failedCommand.name : null;
  // Authentication runs in the connection handshake, which command monitoring doesn't see.
  const command = recorded ?? (server?.code === 18 ? "authenticate (connection handshake)" : null);
  if (command) parts.push(`command: ${command}`);
  let reason = server?.errmsg ?? server?.errorResponse?.errmsg ?? server?.message ?? err?.message ?? "";
  reason = reason.replace(/\s*(:\s*)?\{[\s\S]*$/, "").trim(); // drop an echoed command document
  reason = redactUri(reason, uri).slice(0, 300);
  return `${parts.join(", ")}${reason ? ` — ${reason}` : ""}`;
}

/**
 * Opens the shared connection and applies the collection validators and
 * indexes (both idempotent, so concurrent cold starts are harmless). It does
 * NOT migrate data: that is `npm run migrate`, run once per upgrade, because
 * several Vercel instances may cold-start at the same moment.
 *
 * `maxPoolSize` is small on purpose: on Vercel each warm instance keeps its own
 * pool, and many instances share one Atlas cluster's connection limit.
 */
export async function connectDatabase({ uri, dbName, maxPoolSize = 10, trackFailedCommands = false }) {
  let client;
  // { name, code } of the last command the server rejected, including write
  // errors inside an "ok" reply (admin scripts only: command monitoring adds an
  // event per command, which the API doesn't need).
  let failedCommand = null;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: "ecosetu-api", maxPoolSize, monitorCommands: trackFailedCommands });
    if (trackFailedCommands) {
      client.on("commandFailed", (e) => (failedCommand = { name: e.commandName, code: e.failure?.code }));
      client.on("commandSucceeded", (e) => {
        const writeError = e.reply?.writeErrors?.[0] ?? e.reply?.writeConcernError;
        if (writeError) failedCommand = { name: e.commandName, code: writeError.code };
      });
    }
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    await ensureCollections(db);
    return {
      client,
      db,
      close: () => client.close(),
      /** One line for an error thrown while using this connection (no URI or credentials). */
      describeError: (err) => describeMongoError(err, { uri, failedCommand }),
    };
  } catch (err) {
    await client?.close().catch(() => {});
    const error = new DatabaseError(explainConnectionError(err));
    error.details = describeMongoError(err, { uri, failedCommand });
    throw error;
  }
}

/**
 * Migration (npm run migrate): bins saved by older builds get a valid status
 * and lose `details.fillLevel` / `details.history`. Idempotent — it only
 * touches records that still need it. Returns how many changed.
 */
export async function migrateLegacyBins(db) {
  const col = db.collection("locations");
  const legacy = await col
    .find({
      type: "dustbin",
      $or: [
        { "details.fillLevel": { $exists: true } },
        { "details.history": { $exists: true } },
        { status: { $nin: BIN_STATUSES } },
      ],
    })
    .toArray();
  for (const doc of legacy) {
    const { status, details } = migrateBinLocation({ ...doc, type: "dustbin" });
    // Old records may break other rules too; the migration only fixes these fields.
    await col.updateOne({ _id: doc._id }, { $set: { status, details } }, { bypassDocumentValidation: true });
  }
  return legacy.length;
}

// Base64 photos older builds kept inside documents: [collection, field, pathname field, Blob folder].
const LEGACY_PHOTO_FIELDS = [
  ["complaints", "photo", "photoPath", "complaints"],
  ["complaints", "resolutionPhoto", "resolutionPhotoPath", "resolutions"],
  ["facility_requests", "photo", "photoPath", "facility-requests"],
];

/** How many base64 photos are still stored in MongoDB. */
export async function countLegacyPhotos(db) {
  let n = 0;
  for (const [collection, field] of LEGACY_PHOTO_FIELDS) {
    n += await db.collection(collection).countDocuments({ [field]: { $type: "string" } });
  }
  return n;
}

/**
 * Migration (npm run migrate): moves base64 photos from documents into the
 * private Blob store and keeps only the pathname. Idempotent and safe to
 * interrupt: the pathname is derived from the record id and the image bytes,
 * so a re-run overwrites the same blob, and a document is only updated if it
 * still holds the exact photo that was uploaded. Returns how many moved.
 */
export async function migrateLegacyPhotos(db, store) {
  let moved = 0;
  for (const [collection, field, pathField, folder] of LEGACY_PHOTO_FIELDS) {
    const col = db.collection(collection);
    for (const doc of await col.find({ [field]: { $type: "string" } }, { projection: { [field]: 1 } }).toArray()) {
      const { buffer, contentType, ext } = decodePhoto(doc[field]);
      const pathname = migratedPhotoPathname(folder, doc._id, buffer, ext);
      await store.put(pathname, buffer, contentType, { overwrite: true });
      const res = await col.updateOne(
        { _id: doc._id, [field]: doc[field] },
        { $set: { [pathField]: pathname }, $unset: { [field]: "" } },
        { bypassDocumentValidation: true }
      );
      moved += res.modifiedCount;
    }
  }
  return moved;
}

/**
 * Migration (npm run migrate): sign-in is no longer by phone. This removes
 * every phone number and phone hash from the users, marks the accounts the
 * old phone sign-in made as "phone" (they keep working until they save an
 * email account), drops roles that were pending for a phone number (a hash
 * can't be turned into an email: grant those again by email), removes the
 * "phone for login" consent answer, and drops the phone indexes. Users saved
 * by the oldest builds (a plain `phone`) are converted on the way, including
 * the facility requests they owned as "role:phone".
 *
 * Idempotent, and safe if two runs overlap: every step is a conditional
 * update to the same final values, and a second run finds nothing to do.
 * Returns what changed: { users, requests, pendingRoles, consents, indexesDropped }.
 */
export async function migrateLegacyUsers(db) {
  const changed = { users: 0, requests: 0, pendingRoles: 0, consents: 0, indexesDropped: 0 };
  const users = db.collection("users");
  for (const index of await users.indexes()) {
    if (!index.key || !("phone" in index.key || "phoneHash" in index.key)) continue;
    try {
      await users.dropIndex(index.name);
      changed.indexesDropped += 1;
    } catch (err) {
      if (err?.code !== 27) throw err; // IndexNotFound: an overlapping run dropped it first
    }
  }

  for (const doc of await users.find({ phone: { $exists: true } }).toArray()) {
    const one = await convertLegacyUser(db, doc);
    changed.users += one.user;
    changed.requests += one.requests;
  }

  const stripped = await users.updateMany(
    { $or: [{ phoneHash: { $exists: true } }, { phoneMasked: { $exists: true } }] },
    { $unset: { phoneHash: "", phoneMasked: "" } },
    { bypassDocumentValidation: true }
  );
  changed.users += stripped.modifiedCount;
  // Every account from before this change was a demo account or a phone sign-in.
  const fill = { emailHash: null, emailMasked: null, emailVerified: false };
  const bypass = { bypassDocumentValidation: true };
  changed.users += (await users.updateMany({ authProvider: { $exists: false }, isDemo: true }, { $set: { authProvider: "demo", ...fill } }, bypass)).modifiedCount;
  changed.users += (await users.updateMany({ authProvider: { $exists: false } }, { $set: { authProvider: "phone", ...fill } }, bypass)).modifiedCount;

  changed.pendingRoles = (await db.collection("pending_roles").deleteMany({ kind: { $ne: "email" } })).deletedCount;
  changed.consents = (
    await db.collection("consents").updateMany({ "items.phoneForLogin": { $exists: true } }, { $unset: { "items.phoneForLogin": "" } }, bypass)
  ).modifiedCount;
  return changed;
}

/**
 * Accounts made by "Continue without account" (anonymous Firebase sign-in)
 * can't sign in any more. Each one is removed the way "Delete my data" does
 * it (`deleteUserData`, from the civic repo): its complaints stay on file,
 * anonymised; everything else of it goes. An anonymous account that was
 * later saved with an email is a "password" account and is kept.
 * Idempotent. Returns how many were removed.
 */
export async function removeAnonymousAccounts(db, deleteUserData) {
  let removed = 0;
  for (const { uid } of await db.collection("users").find({ authProvider: "anonymous", isDemo: { $ne: true } }, { projection: { uid: 1 } }).toArray()) {
    await deleteUserData(uid);
    removed += 1;
  }
  return removed;
}

/**
 * Converts one user saved by the oldest builds (a plain `phone`) in place:
 * the number is dropped, the fields newer builds require are filled in, and
 * the facility requests it owned as "role:phone" now point at its uid. Used
 * by the migration, and at sign-in for such an account if the migration
 * hasn't run yet. Returns { user: 0|1, requests }.
 */
async function convertLegacyUser(db, doc) {
  const digits = String(doc.phone ?? "").replace(/\D/g, "").slice(-10);
  const set = {
    authProvider: doc.isDemo ? "demo" : "phone",
    emailHash: null,
    emailMasked: null,
    emailVerified: false,
    createdAt: doc.createdAt ?? doc.updatedAt ?? now(),
    updatedAt: doc.updatedAt ?? now(),
    isDemo: Boolean(doc.isDemo),
    workerId: doc.workerId ?? null,
    name: typeof doc.name === "string" ? doc.name.slice(0, 80) : doc.role,
  };
  const res = await db
    .collection("users")
    .updateOne({ _id: doc._id, phone: { $exists: true } }, { $set: set, $unset: { phone: "", phoneHash: "", phoneMasked: "" } }, { bypassDocumentValidation: true });
  let requests = 0;
  if (/^\d{10}$/.test(digits)) {
    const moved = await db
      .collection("facility_requests")
      .updateMany({ requestedByUser: { $regex: `^[a-z]+:${digits}$` } }, { $set: { requestedByUser: doc.uid } }, { bypassDocumentValidation: true });
    requests = moved.modifiedCount;
  }
  return { user: res.modifiedCount, requests };
}

const now = () => new Date().toISOString();

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
    ...(doc.type === "dustbin" ? { statusSource: doc.statusSource ?? "simulated" } : {}),
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

// Who did something: a person ({ name, uid }) or a system actor (a plain name
// such as "system" or "csv-import", which has no account behind it).
const actorOf = (actor) => (typeof actor === "string" ? { name: actor, uid: null } : { name: actor.name, uid: actor.uid ?? null });

function requestDto(doc) {
  const hasPhoto = Boolean(doc.photoPath || doc.photo);
  return {
    id: doc._id,
    facilityType: doc.facilityType,
    suggestedName: doc.suggestedName,
    location: { address: doc.address, latitude: doc.latitude, longitude: doc.longitude },
    reason: doc.reason,
    description: doc.description,
    priority: doc.priority,
    hasPhoto,
    photoUrl: hasPhoto ? `/api/facility-requests/${doc._id}/photo` : null,
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

// The masked email is the only email data that ever leaves the database layer.
function userDto(doc) {
  return doc
    ? {
        uid: doc.uid,
        role: doc.role,
        name: doc.name,
        workerId: doc.workerId ?? null,
        authProvider: doc.authProvider ?? (doc.isDemo ? "demo" : "phone"),
        emailMasked: doc.emailMasked ?? null,
        emailVerified: Boolean(doc.emailVerified),
        isDemo: Boolean(doc.isDemo),
        sessionsRevokedAt: doc.sessionsRevokedAt ?? null,
      }
    : null;
}

// ---- repository ----------------------------------------------------

const ID_PREFIX = { dustbin: "DB-", public_toilet: "PT-" };
const idPrefix = (type) => ID_PREFIX[type] ?? (type === "campus" ? "CP-" : "BL-");

/**
 * `session` is set only on the transaction-bound copy handed to
 * repo.transaction(fn); everything else uses the plain repository.
 * `identityHashSecret` (PHONE_HASH_SECRET) keys the email hash of saved accounts.
 */
export function createRepository(db, client, session = null, { identityHashSecret = null } = {}) {
  const locations = db.collection("locations");
  const requests = db.collection("facility_requests");
  const users = db.collection("users");
  const refreshTokens = db.collection("refresh_tokens");
  const counters = db.collection("counters");
  const pendingRoles = db.collection("pending_roles");
  const rateLimits = db.collection("auth_rate_limits");
  const opts = session ? { session } : {};
  const emailHash = (email) => hashEmail(email, identityHashSecret);

  // Atomic per-prefix sequence. The counter starts from the highest id that
  // already exists, so ids from seeds or imports are never reused. Counter
  // writes are deliberately outside any transaction (gaps are harmless).
  const nextId = async (prefix, collection, digits = 3) => {
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
    return `${prefix}${String(doc.seq).padStart(digits, "0")}`;
  };

  const locationDoc = (id, loc) => {
    const ts = loc.createdAt ?? now();
    return {
      _id: id,
      name: loc.name,
      type: loc.type,
      latitude: loc.latitude,
      longitude: loc.longitude,
      description: loc.description ?? "",
      address: loc.address ?? "",
      status: loc.status,
      ...(loc.type === "dustbin" ? { statusSource: loc.statusSource ?? "simulated" } : {}),
      details: loc.details ?? {},
      source: loc.source,
      requestId: loc.requestId ?? null,
      createdBy: loc.createdBy,
      // The creator's user id, so "delete my data" can anonymise by id, never by name.
      createdById: loc.createdById ?? null,
      createdAt: ts,
      updatedAt: loc.updatedAt ?? ts,
      isDemo: Boolean(loc.isDemo),
      deletedAt: null,
      deletedBy: null,
      deletedById: null,
      deleteReason: null,
    };
  };

  const insertLocation = async (loc) => {
    const id = loc.id ?? (await nextId(idPrefix(loc.type), "locations"));
    await locations.insertOne(locationDoc(id, loc), opts);
    return id;
  };

  const requestDoc = (id, r) => {
    const ts = r.createdAt ?? now();
    return {
      _id: id,
      facilityType: r.facilityType,
      suggestedName: r.suggestedName,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      reason: r.reason,
      description: r.description ?? "",
      priority: r.priority,
      photoPath: r.photoPath ?? null,
      status: r.status ?? REQUEST_STATUS.PENDING,
      rejectionReason: r.rejectionReason ?? "",
      requestedByUser: r.requestedByUser,
      requestedByWorkerId: r.requestedByWorkerId,
      requestedByWorkerName: r.requestedByWorkerName ?? "",
      reviewedBy: r.reviewedBy ?? null,
      reviewedById: r.reviewedById ?? null,
      isDemo: Boolean(r.isDemo),
      createdAt: ts,
      updatedAt: r.updatedAt ?? ts,
    };
  };

  // Seeding: insert only if no record with this id exists (never overwrite).
  const insertIfMissing = async (collection, filter, doc) =>
    (await collection.updateOne(filter, { $setOnInsert: doc }, { upsert: true, ...opts })).upsertedCount === 1;

  const insertRequest = async (r) => {
    const id = r.id ?? (await nextId(requestIdPrefix(r.createdAt ?? now()), "facility_requests"));
    await requests.insertOne(requestDoc(id, r), opts);
    return id;
  };

  // Turns an approved request into a real, map-visible location.
  const publishRequest = async (req, approver) => {
    const by = actorOf(approver);
    const type = REQUEST_FACILITY_TYPES[req.facilityType];
    const details =
      type === "dustbin"
        ? { wasteType: "Mixed Waste" }
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
      createdBy: by.name,
      createdById: by.uid,
      isDemo: Boolean(req.isDemo),
    });
  };

  const repo = {
    // ---- users & sessions --------------------------------------------
    async getUserByUid(uid) {
      return userDto(await users.findOne({ uid }, opts));
    },

    /**
     * Signs in an email + password account, or makes a new citizen for it.
     * Stores the email only as a keyed hash and a masked copy. A role granted
     * to this email (pending_roles: grant-role, or an official's "Add worker")
     * is applied only when Firebase says the email is verified: otherwise
     * anyone could create an account with an official's address and take
     * their role.
     * Throws { code: "email_taken" } if another account has this email, and
     * { code: "demo_account" } for a seeded demo uid.
     */
    async signInWithEmail({ uid, email, emailVerified, name }) {
      if (await users.findOne({ uid, isDemo: true }, { projection: { _id: 1 }, ...opts })) {
        throw Object.assign(new Error("demo_account"), { code: "demo_account" });
      }
      const legacy = await users.findOne({ uid, phone: { $exists: true } }, opts);
      if (legacy) await convertLegacyUser(db, legacy);
      const ts = now();
      const hash = emailHash(email);
      const set = {
        authProvider: "password",
        emailHash: hash,
        emailMasked: maskEmail(email),
        emailVerified: Boolean(emailVerified),
        updatedAt: ts,
        lastLoginAt: ts,
        ...(name ? { name } : {}),
      };
      const onInsert = { uid, createdAt: ts, role: "citizen", workerId: null, isDemo: false, ...(name ? {} : { name: "citizen" }) };
      try {
        await users.updateOne({ uid }, { $set: set, $unset: { phoneHash: "", phoneMasked: "" }, $setOnInsert: onInsert }, { upsert: true, ...opts });
      } catch (err) {
        if (isDuplicateKey(err)) throw Object.assign(new Error("email_taken"), { code: "email_taken" });
        throw err;
      }
      if (emailVerified) {
        const pending = await pendingRoles.findOne({ _id: hash, kind: "email" }, opts);
        if (pending) {
          await users.updateOne({ uid }, { $set: { role: pending.role, workerId: pending.workerId ?? null, updatedAt: ts } }, opts);
          await pendingRoles.deleteOne({ _id: hash }, opts);
        }
      }
      return this.getUserByUid(uid);
    },

    /**
     * An account the old phone sign-in made. It keeps working (same uid,
     * same role) until its owner saves an email account; no new ones.
     * Returns null if there is no such account.
     */
    async signInLegacyPhone({ uid }) {
      const doc = await users.findOne({ uid }, opts);
      if (!doc || doc.isDemo) return null;
      if (doc.phone !== undefined) await convertLegacyUser(db, doc);
      const ts = now();
      await users.updateOne({ uid }, { $set: { lastLoginAt: ts, updatedAt: ts } }, opts);
      return this.getUserByUid(uid);
    },

    /** Seeding: adds a demo user (no email) unless one with this uid exists. */
    insertDemoUserIfMissing({ uid, role, name, workerId = null }) {
      const ts = now();
      return insertIfMissing(users, { uid }, {
        uid,
        role,
        name,
        workerId,
        authProvider: "demo",
        emailHash: null,
        emailMasked: null,
        emailVerified: false,
        isDemo: true,
        createdAt: ts,
        updatedAt: ts,
      });
    },

    /**
     * Admin operation (npm run grant-role): sets the role of the account
     * saved with this email, or of this uid. The email must be verified for
     * the role to apply now; otherwise (or if nobody has saved this email
     * yet) it is stored as pending and applied when the account signs in with
     * the email verified.
     * Returns { status: "updated" | "pending" | "not_found" }.
     */
    async grantRole({ email, uid, role, workerId = null }) {
      const ts = now();
      const update = { $set: { role, workerId, updatedAt: ts } };
      if (uid) {
        const res = await users.updateOne({ uid }, update, opts);
        return { status: res.matchedCount ? "updated" : "not_found" };
      }
      const hash = emailHash(email);
      const res = await users.updateOne({ emailHash: hash, emailVerified: true, isDemo: false }, update, opts);
      if (res.matchedCount) {
        await pendingRoles.deleteOne({ _id: hash }, opts);
        return { status: "updated" };
      }
      await pendingRoles.updateOne(
        { _id: hash },
        { $set: { kind: "email", role, workerId, updatedAt: ts }, $setOnInsert: { createdAt: ts } },
        { upsert: true, ...opts }
      );
      return { status: "pending" };
    },

    async saveRefreshToken({ uid, tokenHash, expiresAt }) {
      await refreshTokens.insertOne({ uid, tokenHash, expiresAt, createdAt: new Date(), revokedAt: null });
    },

    /**
     * Single-use: atomically marks a valid refresh token as used and returns
     * its owner uid. Presenting a token that was already used or revoked means
     * it was copied (stolen, or replayed): every refresh token of that user is
     * revoked at once, which signs out every device, and null is returned.
     * There is deliberately no grace window — the web client makes sure only
     * one tab refreshes at a time instead.
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
      if (used?.revokedAt) {
        await refreshTokens.updateMany({ uid: used.uid, revokedAt: null }, { $set: { revokedAt: at } });
      }
      return null;
    },

    // ---- rate limits (shared by every instance, expired by a TTL index) ----

    /** Counts one hit against `key` in a fixed window. Returns { count, resetAt }. */
    async hitRateLimit(key, windowMs) {
      const at = new Date();
      const doc = await rateLimits.findOneAndUpdate(
        { _id: key },
        [
          { $set: { _fresh: { $or: [{ $not: ["$windowStart"] }, { $lte: ["$windowStart", new Date(at.getTime() - windowMs)] }] } } },
          {
            $set: {
              count: { $cond: ["$_fresh", 1, { $add: ["$count", 1] }] },
              windowStart: { $cond: ["$_fresh", at, "$windowStart"] },
              expiresAt: { $cond: ["$_fresh", new Date(at.getTime() + windowMs), "$expiresAt"] },
            },
          },
          { $unset: "_fresh" },
        ],
        { upsert: true, returnDocument: "after" }
      );
      return { count: doc.count, resetAt: doc.expiresAt };
    },

    /**
     * One shared slot per `intervalMs` (e.g. Nominatim's one request a
     * second), across every server instance. Resolves { granted: true }, or
     * { granted: false, waitMs } with the time until the slot is free.
     * `nowMs` is the current time (tests pass a virtual clock's time).
     */
    async claimSlot(key, intervalMs, nowMs = Date.now()) {
      const at = new Date(nowMs);
      const fields = { windowStart: at, expiresAt: new Date(at.getTime() + intervalMs + 60_000) };
      const { modifiedCount } = await rateLimits.updateOne(
        { _id: key, windowStart: { $lte: new Date(at.getTime() - intervalMs) } },
        { $set: fields, $inc: { count: 1 } }
      );
      if (modifiedCount) return { granted: true };
      try {
        await rateLimits.insertOne({ _id: key, count: 1, ...fields });
        return { granted: true };
      } catch (err) {
        if (!isDuplicateKey(err)) throw err; // someone else holds the slot
      }
      const doc = await rateLimits.findOne({ _id: key });
      return { granted: false, waitMs: doc ? Math.max(0, doc.windowStart.getTime() + intervalMs - nowMs) : 0 };
    },

    /** Keeps the slot taken until `until` (backing off after the upstream said "too many"). */
    async holdSlot(key, until, intervalMs) {
      await rateLimits.updateOne(
        { _id: key },
        { $set: { windowStart: new Date(until.getTime() - intervalMs), expiresAt: new Date(until.getTime() + 60_000) }, $setOnInsert: { count: 0 } },
        { upsert: true }
      );
    },

    async geocodeCacheGet(key) {
      return db.collection("geocode_cache").findOne({ _id: key, expiresAt: { $gt: new Date() } });
    },

    async geocodeCachePut(key, value, ttlMs) {
      await db.collection("geocode_cache").replaceOne(
        { _id: key },
        { ...value, expiresAt: new Date(Date.now() + ttlMs) },
        { upsert: true }
      );
    },

    /** The hits counted against `key` in its current window (0 if none). */
    async peekRateLimit(key, windowMs) {
      const doc = await rateLimits.findOne({ _id: key });
      if (!doc || doc.windowStart.getTime() <= Date.now() - windowMs) return 0;
      return doc.count;
    },

    async clearRateLimit(key) {
      await rateLimits.deleteOne({ _id: key });
    },

    async revokeRefreshToken(tokenHash) {
      await refreshTokens.updateOne({ tokenHash, revokedAt: null }, { $set: { revokedAt: new Date() } });
    },

    // ---- locations ----------------------------------------------------

    /** A page of live locations, by id. `q` searches name, address, description and id. */
    async pageLocations({ type, kind, q } = {}, { skip, limit }) {
      const FACILITIES = ["dustbin", "public_toilet"];
      const byKind = kind === "facility" ? { type: { $in: FACILITIES } } : kind === "building" ? { type: { $nin: FACILITIES } } : {};
      const match = { deletedAt: null, ...byKind, ...(type ? { type } : {}) };
      if (q) {
        const re = { $regex: escapeRegExp(q), $options: "i" };
        match.$or = [{ name: re }, { address: re }, { description: re }, { _id: re }];
      }
      const [total, rows] = await Promise.all([
        locations.countDocuments(match, opts),
        locations.find(match, opts).sort({ _id: 1 }).skip(skip).limit(limit).toArray(),
      ]);
      return { total, items: rows.map(locationDto) };
    },

    async pageRemoved({ skip, limit }) {
      const match = { deletedAt: { $ne: null } };
      const [total, rows] = await Promise.all([
        locations.countDocuments(match, opts),
        locations.find(match, opts).sort({ deletedAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
      ]);
      return { total, items: rows.map(removedDto) };
    },

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
    /** Seeding: inserts the location with its fixed id unless that id exists. */
    insertLocationIfMissing(loc) {
      return insertIfMissing(locations, { _id: loc.id }, locationDoc(loc.id, loc));
    },
    /** `actor`: { name, uid } for a person, or a plain name for a script. */
    async createLocation(data, actor) {
      const by = actorOf(actor);
      const id = await insertLocation({ ...data, source: "government", createdBy: by.name, createdById: by.uid, isDemo: false });
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
            ...(data.statusSource ? { statusSource: data.statusSource } : {}),
            details: data.details ?? {},
            updatedAt: now(),
          },
        },
        opts
      );
      return this.getLocation(id);
    },
    async softDelete(id, actor, reason) {
      const by = actorOf(actor);
      const res = await locations.updateOne(
        { _id: id, deletedAt: null },
        { $set: { deletedAt: now(), deletedBy: by.name, deletedById: by.uid, deleteReason: reason } },
        opts
      );
      return res.modifiedCount > 0;
    },
    async restore(id) {
      const res = await locations.updateOne(
        { _id: id, deletedAt: { $ne: null } },
        { $set: { deletedAt: null, deletedBy: null, deletedById: null, deleteReason: null, updatedAt: now() } },
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
    async listRequests({ userId, workerId, all }) {
      const rows = await requests.find({}, opts).sort({ createdAt: -1 }).toArray();
      return rows
        .filter(
          (r) =>
            all ||
            r.requestedByUser === userId ||
            // Seeded demo requests have no real login behind them; they are
            // visible to the demo worker whose id they carry.
            (r.isDemo && workerId && r.requestedByWorkerId === workerId)
        )
        .map(requestDto);
    },
    /** A page of facility requests: all of them, or the user's own (plus demo ones for their worker id). */
    async pageRequests({ userId, workerId, all }, { skip, limit }) {
      const match = all
        ? {}
        : { $or: [{ requestedByUser: userId }, ...(workerId ? [{ isDemo: true, requestedByWorkerId: workerId }] : [])] };
      const [total, rows] = await Promise.all([
        requests.countDocuments(match, opts),
        requests.find(match, opts).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
      ]);
      return { total, items: rows.map(requestDto) };
    },

    async getRequest(id) {
      const doc = await requests.findOne({ _id: id }, opts);
      return doc ? requestDto(doc) : null;
    },
    async getRequestOwner(id) {
      const doc = await requests.findOne(
        { _id: id },
        { projection: { requestedByUser: 1, requestedByWorkerId: 1, isDemo: 1, photoPath: 1, photo: 1 }, ...opts }
      );
      return doc
        ? {
            requestedByUser: doc.requestedByUser,
            requestedByWorkerId: doc.requestedByWorkerId,
            isDemo: Boolean(doc.isDemo),
            photoPath: doc.photoPath ?? null,
            legacyPhoto: typeof doc.photo === "string" ? doc.photo : null,
          }
        : null;
    },
    async createRequest(data, userId) {
      const id = await insertRequest({ ...data, requestedByUser: userId, isDemo: false });
      return this.getRequest(id);
    },
    insertRequest,
    /** Seeding: inserts the request with its fixed id unless that id exists. */
    insertRequestIfMissing(r) {
      return insertIfMissing(requests, { _id: r.id }, requestDoc(r.id, r));
    },

    /**
     * Moves a request to a new status. Approving it also publishes the
     * facility, in the same transaction, so a request can never end up
     * approved without its location (or the reverse).
     * Returns { request, location? } or { error: "not_found" | "finalised" }.
     */
    setRequestStatus(id, status, { actor, rejectionReason = "" }) {
      const by = actorOf(actor);
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
              reviewedBy: by.name,
              reviewedById: by.uid,
              updatedAt: now(),
            },
          },
          { session: tx.session }
        );
        let location = null;
        if (status === REQUEST_STATUS.APPROVED) {
          const locId = await tx.publishRequest({ ...doc, id }, by);
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
          result = await fn(createRepository(db, client, s, { identityHashSecret }));
        });
      });
      return result;
    },
    session,
  };
  Object.assign(repo, createCivicRepository({ db, client, nextId }));
  return repo;
}
