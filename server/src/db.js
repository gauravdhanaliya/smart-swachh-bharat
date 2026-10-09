// SQLite persistence (Node's built-in node:sqlite — no native build step).
//
// Schema is versioned with PRAGMA user_version; add new migrations to the
// end of MIGRATIONS and they run once, in order, on next start.

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { REQUEST_FACILITY_TYPES, REQUEST_STATUS } from "./constants.js";

const MIGRATIONS = [
  // v1 — locations + facility requests
  `
  CREATE TABLE locations (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL,
    latitude     REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude    REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    description  TEXT NOT NULL DEFAULT '',
    address      TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL,
    details      TEXT NOT NULL DEFAULT '{}',
    source       TEXT NOT NULL,
    request_id   TEXT,
    created_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    is_demo      INTEGER NOT NULL DEFAULT 0,
    deleted_at   TEXT,
    deleted_by   TEXT,
    delete_reason TEXT
  );
  CREATE INDEX idx_locations_type ON locations (type);
  CREATE INDEX idx_locations_deleted ON locations (deleted_at);

  CREATE TABLE facility_requests (
    id                       TEXT PRIMARY KEY,
    facility_type            TEXT NOT NULL,
    suggested_name           TEXT NOT NULL,
    address                  TEXT NOT NULL,
    latitude                 REAL NOT NULL,
    longitude                REAL NOT NULL,
    reason                   TEXT NOT NULL,
    description              TEXT NOT NULL DEFAULT '',
    priority                 TEXT NOT NULL,
    photo                    TEXT,
    status                   TEXT NOT NULL,
    rejection_reason         TEXT NOT NULL DEFAULT '',
    requested_by_user        TEXT NOT NULL,
    requested_by_worker_id   TEXT NOT NULL,
    requested_by_worker_name TEXT NOT NULL DEFAULT '',
    reviewed_by              TEXT,
    is_demo                  INTEGER NOT NULL DEFAULT 0,
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL
  );
  CREATE INDEX idx_requests_status ON facility_requests (status);
  `,
  // v2 — demo dustbins and toilets are no longer seeded; remove any that an
  // earlier seed created (and the demo request that had published one).
  `
  DELETE FROM locations WHERE is_demo = 1 AND type IN ('dustbin', 'public_toilet');
  DELETE FROM facility_requests WHERE id = 'FR-2026-002' AND is_demo = 1;
  `,
];

export function openDatabase(dbPath) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.prepare("PRAGMA user_version").get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

const now = () => new Date().toISOString();

function transaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ---- DTOs ----------------------------------------------------------

function locationDto(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    latitude: row.latitude,
    longitude: row.longitude,
    description: row.description,
    address: row.address,
    status: row.status,
    details: JSON.parse(row.details || "{}"),
    source: row.source,
    requestId: row.request_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDemo: Boolean(row.is_demo),
  };
}

function removedDto(row) {
  return {
    ...locationDto(row),
    removedAt: row.deleted_at,
    removedBy: row.deleted_by,
    removalReason: row.delete_reason,
  };
}

function requestDto(row) {
  return {
    id: row.id,
    facilityType: row.facility_type,
    suggestedName: row.suggested_name,
    location: { address: row.address, latitude: row.latitude, longitude: row.longitude },
    reason: row.reason,
    description: row.description,
    priority: row.priority,
    photo: row.photo,
    status: row.status,
    rejectionReason: row.rejection_reason,
    requestedByWorkerId: row.requested_by_worker_id,
    requestedByWorkerName: row.requested_by_worker_name,
    reviewedBy: row.reviewed_by,
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---- repository ----------------------------------------------------

const ID_PREFIX = { dustbin: "DB-", public_toilet: "PT-" };
const idPrefix = (type) => ID_PREFIX[type] ?? (type === "campus" ? "CP-" : "BL-");

export function createRepository(db) {
  const nextId = (prefix, table = "locations") => {
    const rows = db.prepare(`SELECT id FROM ${table} WHERE id LIKE ?`).all(`${prefix}%`);
    const max = rows
      .map((r) => parseInt(r.id.slice(prefix.length), 10))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => Math.max(a, b), 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  };

  const insertLocation = (loc) => {
    const id = loc.id ?? nextId(idPrefix(loc.type));
    const ts = loc.createdAt ?? now();
    db.prepare(
      `INSERT INTO locations (id, name, type, latitude, longitude, description, address, status,
         details, source, request_id, created_by, created_at, updated_at, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      loc.name,
      loc.type,
      loc.latitude,
      loc.longitude,
      loc.description ?? "",
      loc.address ?? "",
      loc.status,
      JSON.stringify(loc.details ?? {}),
      loc.source,
      loc.requestId ?? null,
      loc.createdBy,
      ts,
      loc.updatedAt ?? ts,
      loc.isDemo ? 1 : 0
    );
    return id;
  };

  const getLocationRow = (id) => db.prepare("SELECT * FROM locations WHERE id = ?").get(id);

  const insertRequest = (r) => {
    const id = r.id ?? nextId("FR-2026-", "facility_requests");
    const ts = r.createdAt ?? now();
    db.prepare(
      `INSERT INTO facility_requests (id, facility_type, suggested_name, address, latitude, longitude,
         reason, description, priority, photo, status, rejection_reason, requested_by_user,
         requested_by_worker_id, requested_by_worker_name, reviewed_by, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      r.facilityType,
      r.suggestedName,
      r.address,
      r.latitude,
      r.longitude,
      r.reason,
      r.description ?? "",
      r.priority,
      r.photo ?? null,
      r.status ?? REQUEST_STATUS.PENDING,
      r.rejectionReason ?? "",
      r.requestedByUser,
      r.requestedByWorkerId,
      r.requestedByWorkerName ?? "",
      r.reviewedBy ?? null,
      r.isDemo ? 1 : 0,
      ts,
      r.updatedAt ?? ts
    );
    return id;
  };

  // Turns an approved request into a real, map-visible location.
  const publishRequest = (row, approver) => {
    const type = REQUEST_FACILITY_TYPES[row.facility_type];
    const details =
      type === "dustbin"
        ? { wasteType: "Mixed Waste", fillLevel: 0 }
        : { openingHours: "Not specified yet", cleanliness: 3, facilities: ["Men", "Women"] };
    return insertLocation({
      name: row.suggested_name,
      type,
      latitude: row.latitude,
      longitude: row.longitude,
      description: row.is_demo ? `DEMO — ${row.reason}` : row.reason,
      address: row.address,
      status: type === "dustbin" ? "normal" : "Open",
      details,
      source: "worker_approved",
      requestId: row.id,
      createdBy: approver,
      isDemo: Boolean(row.is_demo),
    });
  };

  return {
    // locations
    listLocations({ type, q } = {}) {
      const rows = db.prepare("SELECT * FROM locations WHERE deleted_at IS NULL ORDER BY id").all();
      const needle = q ? q.toLowerCase() : null;
      return rows
        .filter((r) => !type || r.type === type)
        .filter(
          (r) =>
            !needle ||
            r.name.toLowerCase().includes(needle) ||
            r.address.toLowerCase().includes(needle) ||
            r.description.toLowerCase().includes(needle) ||
            r.id.toLowerCase().includes(needle)
        )
        .map(locationDto);
    },
    listRemoved() {
      return db
        .prepare("SELECT * FROM locations WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")
        .all()
        .map(removedDto);
    },
    getLocation(id) {
      const row = getLocationRow(id);
      return row && !row.deleted_at ? locationDto(row) : null;
    },
    createLocation(data, actor) {
      const id = insertLocation({ ...data, source: "government", createdBy: actor, isDemo: false });
      return locationDto(getLocationRow(id));
    },
    updateLocation(id, data) {
      db.prepare(
        `UPDATE locations SET name = ?, type = ?, latitude = ?, longitude = ?, description = ?,
           address = ?, status = ?, details = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
      ).run(
        data.name,
        data.type,
        data.latitude,
        data.longitude,
        data.description,
        data.address,
        data.status,
        JSON.stringify(data.details ?? {}),
        now(),
        id
      );
      return this.getLocation(id);
    },
    softDelete(id, actor, reason) {
      const info = db
        .prepare(
          "UPDATE locations SET deleted_at = ?, deleted_by = ?, delete_reason = ? WHERE id = ? AND deleted_at IS NULL"
        )
        .run(now(), actor, reason, id);
      return info.changes > 0;
    },
    restore(id) {
      const info = db
        .prepare(
          "UPDATE locations SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL"
        )
        .run(now(), id);
      if (!info.changes) return null;
      return locationDto(getLocationRow(id));
    },
    countLocations() {
      return db.prepare("SELECT COUNT(*) AS n FROM locations").get().n;
    },
    insertLocation,

    // facility requests
    listRequests({ userSub, workerId, all }) {
      const rows = db.prepare("SELECT * FROM facility_requests ORDER BY created_at DESC").all();
      return rows
        .filter(
          (r) =>
            all ||
            r.requested_by_user === userSub ||
            // Seeded demo requests have no real login behind them; they are
            // visible to the demo worker whose id they carry.
            (r.is_demo && workerId && r.requested_by_worker_id === workerId)
        )
        .map(requestDto);
    },
    getRequest(id) {
      const row = db.prepare("SELECT * FROM facility_requests WHERE id = ?").get(id);
      return row ? requestDto(row) : null;
    },
    getRequestOwner(id) {
      const row = db
        .prepare("SELECT requested_by_user, requested_by_worker_id, is_demo FROM facility_requests WHERE id = ?")
        .get(id);
      return row ?? null;
    },
    createRequest(data, userSub) {
      const id = insertRequest({ ...data, requestedByUser: userSub, isDemo: false });
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
      return transaction(db, () => {
        const row = db.prepare("SELECT * FROM facility_requests WHERE id = ?").get(id);
        if (!row) return { error: "not_found" };
        if (row.status === REQUEST_STATUS.APPROVED || row.status === REQUEST_STATUS.REJECTED) {
          return { error: "finalised", current: row.status };
        }
        db.prepare(
          `UPDATE facility_requests SET status = ?, rejection_reason = ?, reviewed_by = ?, updated_at = ? WHERE id = ?`
        ).run(
          status,
          status === REQUEST_STATUS.REJECTED ? rejectionReason : "",
          actor,
          now(),
          id
        );
        let location = null;
        if (status === REQUEST_STATUS.APPROVED) {
          const locId = publishRequest(row, actor);
          location = locationDto(getLocationRow(locId));
        }
        return { request: this.getRequest(id), location };
      });
    },
    publishRequest,
    countRequests() {
      return db.prepare("SELECT COUNT(*) AS n FROM facility_requests").get().n;
    },
    transaction: (fn) => transaction(db, fn),
  };
}
