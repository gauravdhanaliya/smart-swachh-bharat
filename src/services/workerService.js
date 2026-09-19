// Government "Workers" directory — Add Worker / Remove Worker.
//
// Mirrors the services/facilityService.js pattern exactly:
//   1. the existing demo staff       (src/data/workers.js, WORKERS)
//   2. Government-added workers      (this file, localStorage)
// combine into the one list getAllWorkers() every screen reads from.
// Removal is a tombstone (like facility removal), not a mutation of the
// demo array, so it stays reversible and keeps an audit trail of who
// was taken off the roster and why.
//
// Deliberately NOT wired into the Worker-side demo login switcher
// (hooks/useWorkerSession.js) or the complaint assignment dropdown —
// those still read the original static WORKERS list. This directory is
// the Government Official's view of staff; unifying the two would be a
// separate step if ever needed.

import { WORKERS } from "../data/workers";

export const WORKER_SOURCE = {
  DEMO: "DEMO",
  GOVERNMENT: "GOVERNMENT",
};

export const WORKER_STATUS_OPTIONS = ["Available", "On Duty"];

const STORAGE_KEY = "ssb_gov_worker_directory_v1";
const REMOVED_STORAGE_KEY = "ssb_removed_workers_v1";

function isoNow() {
  return new Date().toISOString();
}

const listeners = new Set();

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // A misbehaving subscriber shouldn't break the store.
    }
  });
}

function readAddedWorkers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Corrupt/blocked storage — fall back to an empty list below.
  }
  return [];
}

function writeAddedWorkers(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage unavailable — the change still applies
    // this session, never throws and blocks the UI.
  }
  notify();
  return list;
}

function readRemovedWorkers() {
  try {
    const raw = localStorage.getItem(REMOVED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Corrupt/blocked storage — behave as if nothing was removed.
  }
  return [];
}

function writeRemovedWorkers(list) {
  try {
    localStorage.setItem(REMOVED_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Same tolerance as writeAddedWorkers.
  }
  notify();
  return list;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === REMOVED_STORAGE_KEY) notify();
  });
}

function removedIdSet() {
  return new Set(readRemovedWorkers().map((r) => r.id));
}

/** Next "wNN" / "W0NN" pair, continuing whatever ids already exist. */
function nextWorkerIds(existingDisplayIds) {
  const numbers = existingDisplayIds
    .map((d) => parseInt(String(d).replace(/[^0-9]/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return {
    id: `gw-${next}`,
    displayId: `W${String(next).padStart(3, "0")}`,
  };
}

/**
 * GET /api/workers — demo staff + Government-added staff, minus anyone
 * removed. This — not data/workers.js directly — is what the
 * Government "Workers" screen reads from.
 */
export function getAllWorkers() {
  const removed = removedIdSet();
  return [
    ...WORKERS.map((w) => ({ ...w, source: w.source ?? WORKER_SOURCE.DEMO })),
    ...readAddedWorkers(),
  ].filter((w) => !removed.has(w.id));
}

/**
 * POST /api/workers — Government "Add Worker".
 * `data` should already be validated by the caller (name/area required):
 *   { name, role?, area, phone?, status? }
 */
export function addWorker(data) {
  const all = getAllWorkers();
  const { id, displayId } = nextWorkerIds(all.map((w) => w.displayId));

  const worker = {
    id,
    displayId,
    name: data.name.trim(),
    role: data.role?.trim() || "Sanitation Worker",
    area: data.area.trim(),
    status: data.status || "Available",
    phone: data.phone?.trim() || "",
    source: WORKER_SOURCE.GOVERNMENT,
    createdAt: isoNow(),
  };

  writeAddedWorkers([...readAddedWorkers(), worker]);
  return worker;
}

/**
 * DELETE /api/workers/:id — Government "Remove Worker".
 * Takes the worker object straight off the card (so the removal record
 * keeps their name/area for the audit trail). Reversible via
 * restoreWorker(). Returns the removal record, or null if already removed.
 */
export function removeWorker(worker, options = {}) {
  const id = typeof worker === "string" ? worker : worker?.id;
  if (!id) return null;

  const current = readRemovedWorkers();
  if (current.some((r) => r.id === id)) return null;

  const record = {
    id,
    displayId: (typeof worker === "object" && worker?.displayId) || id,
    name: (typeof worker === "object" && worker?.name) || id,
    area: (typeof worker === "object" && worker?.area) || "",
    source: (typeof worker === "object" && worker?.source) || WORKER_SOURCE.DEMO,
    reason: (options.reason || "").trim() || "No reason recorded",
    removedBy: options.removedBy || "District Officer",
    removedAt: isoNow(),
  };

  writeRemovedWorkers([...current, record]);
  return record;
}

/** Undo a removal — the worker reappears on the directory immediately. */
export function restoreWorker(id) {
  const current = readRemovedWorkers();
  const next = current.filter((r) => r.id !== id);
  if (next.length === current.length) return false;
  writeRemovedWorkers(next);
  return true;
}

/** Everyone Government has taken off the roster, newest first. */
export function getRemovedWorkers() {
  return readRemovedWorkers()
    .slice()
    .sort((a, b) => String(b.removedAt).localeCompare(String(a.removedAt)));
}

/** Subscribes to any change (Government add/remove, cross-tab). */
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Demo/dev helper — wipes Government-added workers and un-removes
 * anyone removed during the session, so a fresh demo run starts from
 * the same seed roster every time. */
export function resetDemoData() {
  writeRemovedWorkers([]);
  writeAddedWorkers([]);
  return [];
}
