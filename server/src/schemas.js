// MongoDB JSON-schema validators and indexes for every collection.
//
// The API validates input before it gets here (validate.js); these rules are
// the second line: the database itself refuses a record with a missing owner,
// an unknown status, a plain phone number or an over-long comment, whichever
// code path wrote it. `additionalProperties: false` means a field nobody
// planned for (say, an old `fillLevel`) can't creep back in.
//
// ensureCollections() is run on every connect. It creates what is missing and
// re-applies the validators and indexes to what exists, so it is safe to run
// on every cold start and from several instances at once.

import {
  CONSENT_ITEMS,
  RATING_CATEGORIES,
  LOCATION_TYPES,
  REQUEST_FACILITY_TYPES,
  REQUEST_PRIORITIES,
  REQUEST_STATUS,
  ROLES,
  SOURCES,
  STATUS_BY_TYPE,
} from "./constants.js";

const str = (maxLength, extra = {}) => ({ bsonType: "string", maxLength, ...extra });
const nullable = (schema) => ({ ...schema, bsonType: [schema.bsonType, "null"] });
const iso = { bsonType: "string", minLength: 10, maxLength: 40 };
// Bounds are only included when given: MongoDB rejects `maximum: undefined`.
const bounds = (minimum, maximum) => ({
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
});
const number = (minimum, maximum) => ({ bsonType: ["double", "int", "long", "decimal"], ...bounds(minimum, maximum) });
const int = (minimum, maximum) => ({ bsonType: "int", ...bounds(minimum, maximum) });
const bool = { bsonType: "bool" };
const date = { bsonType: "date" };
const HEX64 = "^[0-9a-f]{64}$";

// Photos are base64 data URLs; the API caps the image at 1 MB (about 1.4 MB as text).
const PHOTO = nullable(str(1_500_000, { pattern: "^data:image/(jpeg|png|webp);base64," }));

const object = (required, properties, extra = {}) => ({
  bsonType: "object",
  required,
  additionalProperties: false,
  properties,
  ...extra,
});

export const COMPLAINT_STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"];
export const COMPLAINT_PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
export { RATING_CATEGORIES, CONSENT_ITEMS } from "./constants.js";
export const NOTIFICATION_KINDS = ["complaint", "facility_request", "system"];

const ALL_LOCATION_STATUSES = [...new Set(Object.values(STATUS_BY_TYPE).flat())];

export const SCHEMAS = {
  users: object(["uid", "role", "name", "phoneHash", "phoneMasked", "workerId", "isDemo", "createdAt", "updatedAt"], {
    _id: { bsonType: "objectId" },
    uid: str(128, { minLength: 1 }),
    // HMAC of the phone number (see phone.js). Demo users have no phone.
    phoneHash: nullable(str(64, { pattern: HEX64 })),
    phoneMasked: nullable(str(20, { pattern: "^\\+91 \\d{2}X{6}\\d{2}$" })),
    role: { enum: ROLES },
    name: str(80),
    workerId: nullable(str(24)),
    isDemo: bool,
    createdAt: iso,
    updatedAt: iso,
    lastLoginAt: iso,
    // Access tokens issued at or before this moment are refused (consent withdrawn).
    sessionsRevokedAt: nullable(iso),
  }),

  pending_roles: object(["_id", "role", "createdAt", "updatedAt"], {
    _id: str(64), // the phone hash of someone who hasn't signed in yet
    role: { enum: ROLES },
    workerId: nullable(str(24)),
    createdAt: iso,
    updatedAt: iso,
  }),

  locations: object(
    ["_id", "name", "type", "latitude", "longitude", "status", "details", "source", "createdAt", "updatedAt", "isDemo"],
    {
      _id: str(32, { pattern: "^(DB|PT|BL|CP)-[A-Za-z0-9-]+$" }),
      name: str(120, { minLength: 1 }),
      type: { enum: LOCATION_TYPES },
      latitude: number(-90, 90),
      longitude: number(-180, 180),
      description: str(1000),
      address: str(300),
      status: { enum: ALL_LOCATION_STATUSES },
      // Bins only: "manual" when an official or worker set the status, and
      // then the demo simulation never changes it.
      statusSource: { enum: ["manual", "simulated"] },
      details: { bsonType: "object" },
      source: { enum: SOURCES },
      requestId: nullable(str(32)),
      createdBy: str(120),
      // The user ids behind createdBy / deletedBy (null for scripts and seeds).
      createdById: nullable(str(128)),
      createdAt: iso,
      updatedAt: iso,
      isDemo: bool,
      deletedAt: nullable(iso),
      deletedBy: nullable(str(120)),
      deletedById: nullable(str(128)),
      deleteReason: nullable(str(200)),
    }
  ),

  facility_requests: object(
    ["_id", "facilityType", "suggestedName", "address", "latitude", "longitude", "reason", "priority", "status", "requestedByUser", "requestedByWorkerId", "isDemo", "createdAt", "updatedAt"],
    {
      _id: str(32, { pattern: "^FR-\\d{4}-\\d{3,}$" }),
      facilityType: { enum: Object.keys(REQUEST_FACILITY_TYPES) },
      suggestedName: str(120, { minLength: 1 }),
      address: str(200, { minLength: 1 }),
      latitude: number(-90, 90),
      longitude: number(-180, 180),
      reason: str(300, { minLength: 1 }),
      description: str(500),
      priority: { enum: REQUEST_PRIORITIES },
      // The photo's pathname in the private Blob store. `photo` (base64) is
      // what older builds stored; npm run migrate moves it to the store.
      photoPath: nullable(str(200, { pattern: "^facility-requests/" })),
      photo: PHOTO,
      status: { enum: Object.values(REQUEST_STATUS) },
      rejectionReason: str(300),
      requestedByUser: str(128), // the requester's uid
      requestedByWorkerId: str(24),
      requestedByWorkerName: str(80),
      reviewedBy: nullable(str(120)),
      reviewedById: nullable(str(128)),
      isDemo: bool,
      createdAt: iso,
      updatedAt: iso,
    }
  ),

  complaints: object(
    ["_id", "citizenId", "citizenName", "issueType", "description", "location", "priority", "status", "isDemo", "createdAt", "updatedAt"],
    {
      _id: str(24, { pattern: "^SSB\\d{4}-\\d{4,}$" }),
      // null once the citizen has deleted their data (the complaint is kept, unlinked)
      citizenId: nullable(str(128, { minLength: 1 })),
      citizenName: str(80),
      issueType: str(60, { minLength: 1 }),
      category: nullable(str(40)),
      description: str(500),
      location: object(["address", "latitude", "longitude"], {
        address: str(200),
        latitude: number(-90, 90),
        longitude: number(-180, 180),
      }),
      facilityType: { enum: ["bin", "toilet", null] },
      facilityId: nullable(str(32)),
      priority: { enum: COMPLAINT_PRIORITIES },
      // Pathnames in the private Blob store. `photo` / `resolutionPhoto`
      // (base64) are what older builds stored; npm run migrate moves them.
      photoPath: nullable(str(200, { pattern: "^complaints/" })),
      resolutionPhotoPath: nullable(str(200, { pattern: "^resolutions/" })),
      photo: PHOTO,
      status: { enum: COMPLAINT_STATUSES },
      assignedWorkerId: nullable(str(24)),
      assignedWorkerName: nullable(str(80)),
      // The worker account's user id, so anonymisation goes by id, not name.
      assignedWorkerUid: nullable(str(128)),
      resolutionNote: str(300),
      resolutionPhoto: PHOTO,
      // "<citizenId>|<facilityId>|<category>" while open, null otherwise: a
      // unique index on it makes duplicate open reports impossible, even
      // when two arrive at the same moment.
      openKey: nullable(str(300)),
      isDemo: bool,
      createdAt: iso,
      updatedAt: iso,
    }
  ),

  // One vote per user per complaint (unique index).
  complaint_votes: object(["complaintId", "userId", "direction", "createdAt", "updatedAt"], {
    _id: { bsonType: "objectId" },
    complaintId: str(24, { minLength: 1 }),
    userId: str(128, { minLength: 1 }),
    direction: { enum: ["up", "down"] },
    createdAt: iso,
    updatedAt: iso,
  }),

  toilet_ratings: object(["toiletId", "userId", "stars", "categories", "comment", "createdAt", "updatedAt"], {
    _id: { bsonType: "objectId" },
    toiletId: str(32, { minLength: 1 }),
    userId: str(128, { minLength: 1 }),
    stars: int(1, 5),
    categories: {
      bsonType: "object",
      additionalProperties: false,
      properties: Object.fromEntries(RATING_CATEGORIES.map((c) => [c, int(1, 5)])),
    },
    comment: str(300),
    createdAt: iso,
    updatedAt: iso,
  }),

  notifications: object(["userId", "kind", "message", "createdAt"], {
    _id: { bsonType: "objectId" },
    userId: str(128, { minLength: 1 }),
    kind: { enum: NOTIFICATION_KINDS },
    message: str(200, { minLength: 1 }),
    detail: str(300),
    complaintId: nullable(str(24)),
    // For complaint notices: the status it announces, so the app can apply
    // the user's alert settings (resolved vs other updates).
    status: { enum: [...COMPLAINT_STATUSES, null] },
    requestId: nullable(str(32)),
    readAt: nullable(iso),
    createdAt: iso,
  }),

  // Per-user profile. Officials: their government profile; others: a name.
  profiles: object(["_id", "updatedAt"], {
    _id: str(128, { minLength: 1 }), // the user's uid
    state: str(60),
    district: str(80),
    ministry: str(120),
    updatedAt: iso,
  }),

  // The worker directory officials manage. A phone number is kept only masked.
  workers: object(["_id", "displayId", "name", "role", "area", "status", "source", "createdAt"], {
    _id: str(24, { pattern: "^[A-Za-z0-9_-]{1,24}$" }),
    displayId: str(12),
    name: str(80, { minLength: 1 }),
    role: str(60),
    area: str(120),
    status: { enum: ["Available", "On Duty"] },
    phoneMasked: nullable(str(20, { pattern: "^\\+91 \\d{2}X{6}\\d{2}$" })),
    source: { enum: ["DEMO", "GOVERNMENT"] },
    createdAt: iso,
    createdBy: str(120),
    createdById: nullable(str(128)),
    removedAt: nullable(iso),
    removedBy: nullable(str(120)),
    removedById: nullable(str(128)),
    removalReason: nullable(str(200)),
  }),

  consents: object(["_id", "version", "acceptedAt", "items", "updatedAt"], {
    _id: str(128, { minLength: 1 }), // the user's uid: one consent record per user
    version: int(1),
    acceptedAt: iso,
    items: object(CONSENT_ITEMS, Object.fromEntries(CONSENT_ITEMS.map((k) => [k, bool]))),
    updatedAt: iso,
  }),

  refresh_tokens: object(["uid", "tokenHash", "expiresAt", "createdAt", "revokedAt"], {
    _id: { bsonType: "objectId" },
    uid: str(128, { minLength: 1 }),
    tokenHash: str(64, { pattern: HEX64 }), // SHA-256 of the token, never the token
    expiresAt: date,
    createdAt: date,
    revokedAt: nullable(date),
  }),

  // Blob deletes that failed; retried by the daily cron (routes-civic.js).
  blob_deletions: object(["_id", "attempts", "createdAt", "updatedAt"], {
    _id: str(200), // the blob pathname
    attempts: int(0),
    lastError: str(300),
    createdAt: iso,
    updatedAt: iso,
  }),

  // Fixed-window request counters, shared by every server instance.
  auth_rate_limits: object(["_id", "count", "windowStart", "expiresAt"], {
    _id: str(200),
    count: int(0),
    windowStart: date,
    expiresAt: date,
  }),

  // Nominatim answers, kept for a week (its policy asks apps to cache).
  // _id is "search:<normalised query>" or "reverse:<lat>,<lon>" (5 decimals).
  geocode_cache: object(["_id", "expiresAt"], {
    _id: str(220, { minLength: 1 }),
    results: {
      bsonType: "array",
      maxItems: 5,
      items: object(["label", "latitude", "longitude", "wide"], {
        label: str(300),
        latitude: number(-90, 90),
        longitude: number(-180, 180),
        wide: bool,
      }),
    },
    address: nullable(str(300)),
    expiresAt: date,
  }),

  counters: object(["_id", "seq"], {
    _id: str(32),
    seq: { bsonType: ["int", "long", "double"], minimum: 0 },
  }),
};

export const INDEXES = {
  users: [
    { key: { uid: 1 }, unique: true, name: "uid_unique" },
    // Partial, so the phoneless demo users don't collide on null.
    { key: { phoneHash: 1 }, unique: true, name: "phoneHash_unique", partialFilterExpression: { phoneHash: { $type: "string" } } },
    { key: { role: 1 }, name: "role" },
    { key: { createdAt: -1 }, name: "createdAt" },
  ],
  pending_roles: [],
  locations: [
    { key: { deletedAt: 1, type: 1 }, name: "deleted_type" },
    { key: { status: 1 }, name: "status" },
    { key: { source: 1, isDemo: 1 }, name: "source_demo" },
    { key: { createdAt: -1 }, name: "createdAt" },
  ],
  facility_requests: [
    { key: { status: 1 }, name: "status" },
    { key: { createdAt: -1 }, name: "createdAt" },
    { key: { requestedByUser: 1 }, name: "requestedByUser" },
    { key: { requestedByWorkerId: 1 }, name: "requestedByWorkerId" },
  ],
  complaints: [
    { key: { citizenId: 1, status: 1 }, name: "citizen_status" },
    { key: { facilityId: 1 }, name: "facilityId" },
    { key: { assignedWorkerId: 1, status: 1 }, name: "worker_status" },
    { key: { status: 1, createdAt: -1 }, name: "status_createdAt" },
    { key: { createdAt: -1, _id: -1 }, name: "createdAt_id" },
    { key: { openKey: 1 }, unique: true, name: "openKey_unique", partialFilterExpression: { openKey: { $type: "string" } } },
  ],
  complaint_votes: [
    { key: { complaintId: 1, userId: 1 }, unique: true, name: "complaint_user_unique" },
    { key: { userId: 1 }, name: "userId" },
  ],
  toilet_ratings: [
    { key: { toiletId: 1, userId: 1 }, unique: true, name: "toilet_user_unique" },
    { key: { toiletId: 1, updatedAt: -1 }, name: "toilet_recent" },
    { key: { userId: 1 }, name: "userId" },
  ],
  notifications: [{ key: { userId: 1, createdAt: -1, _id: -1 }, name: "user_createdAt_id" }],
  consents: [],
  profiles: [],
  workers: [{ key: { removedAt: 1, _id: 1 }, name: "removed_id" }],
  refresh_tokens: [
    { key: { tokenHash: 1 }, unique: true, name: "tokenHash_unique" },
    { key: { uid: 1 }, name: "uid" },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "expiresAt_ttl" },
  ],
  auth_rate_limits: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "expiresAt_ttl" }],
  blob_deletions: [],
  geocode_cache: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "expiresAt_ttl" }],
  counters: [],
};

export const COLLECTION_NAMES = Object.keys(SCHEMAS);

const NAMESPACE_EXISTS = 48;

/** Creates missing collections, (re)applies every validator, and makes sure the indexes exist. */
export async function ensureCollections(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of COLLECTION_NAMES) {
    const options = { validator: { $jsonSchema: SCHEMAS[name] }, validationLevel: "strict", validationAction: "error" };
    if (!existing.has(name)) {
      try {
        await db.createCollection(name, options);
        continue;
      } catch (err) {
        if (err?.code !== NAMESPACE_EXISTS) throw err; // another instance created it first
      }
    }
    await db.command({ collMod: name, ...options });
  }
  await Promise.all(
    COLLECTION_NAMES.filter((name) => INDEXES[name].length).map((name) => db.collection(name).createIndexes(INDEXES[name]))
  );
}
