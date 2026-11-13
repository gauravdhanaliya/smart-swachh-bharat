// Single source of truth for complaint data. Every role (Citizen,
// Government Official, Worker) reads and writes through this module,
// so the same complaint object travels across the whole app.
//
// For this prototype, data lives in localStorage. When a real backend
// is ready, only the internals of this file need to change (readAll /
// writeAll) — every screen already calls getComplaints/createComplaint/
// updateComplaint/etc., not localStorage directly.

import {
  STATUS,
  SEED_COMPLAINTS,
} from "../data/complaints";
import { apiEnabled } from "./apiConfig";
import * as remote from "./complaintRemote";
import { ApiError } from "./api";
import { readSession } from "./authSession";
import { validateComplaint } from "../../server/src/validate-civic.js";
import { ValidationError } from "../../server/src/validate.js";
import { DELETED_USER_NAME, PHOTO_NOT_SAVED } from "../../server/src/constants.js";
import { complaintIdPrefix } from "../../server/src/ids.js";

// With VITE_USE_API=true every function below goes to the EcoSetu API
// (complaintRemote.js); writes then return Promises. Otherwise they work on
// this browser's localStorage exactly as before.

const STORAGE_KEY = "ssb_complaints_v1";

const listeners = new Set();

function notify(list) {
  listeners.forEach((cb) => {
    try {
      cb(list);
    } catch {
      // A misbehaving subscriber shouldn't break the store.
    }
  });
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupt/blocked storage — fall back to seed data below.
  }
  writeAll(SEED_COMPLAINTS, { silent: true });
  return SEED_COMPLAINTS;
}

function writeAll(list, { silent = false } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage unavailable (e.g. private browsing).
    // The in-memory list still updates for this session so the demo
    // can continue even if persistence silently fails.
  }
  if (!silent) notify(list);
  return list;
}

// Keep every open tab/component in sync when storage changes elsewhere.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      try {
        notify(event.newValue ? JSON.parse(event.newValue) : []);
      } catch {
        // ignore malformed cross-tab payloads
      }
    }
  });
}

// Same as the server: the year it was created in (India time), numbered within that year.
function generateComplaintId(existing, at = new Date()) {
  const prefix = complaintIdPrefix(at);
  const numbers = existing
    .map((c) => c.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/** Returns all complaints, newest first. */
export function getComplaints() {
  if (apiEnabled()) return remote.getAll();
  return [...readAll()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getComplaintById(id) {
  if (apiEnabled()) return remote.getById(id);
  return readAll().find((c) => c.id === id) ?? null;
}

/**
 * Creates a new complaint from validated citizen input and returns it.
 * `data` should already be sanitized/validated by the caller (ReportIssue).
 */
export function createComplaint(data) {
  if (apiEnabled()) return remote.create(data);
  const all = readAll();
  const now = new Date().toISOString();
  const complaint = {
    id: generateComplaintId(all, now),
    // Who filed it: "Delete my data" (anonymiseLocalComplaints) finds a citizen's reports by this.
    citizenId: data.citizenId ?? null,
    citizenName: data.citizenName,
    issueType: data.issueType,
    description: data.description,
    location: data.location,
    priority: data.priority,
    photo: data.photo ?? null,
    status: STATUS.SUBMITTED,
    assignedWorkerId: null,
    assignedWorkerName: null,
    resolutionNote: "",
    createdAt: now,
    updatedAt: now,
  };

  const next = [...all, complaint];
  const persisted = tryWriteWithPhotoFallback(next, complaint.id);
  return persisted;
}

/**
 * A complaint about one bin or toilet (Feature 4). `facility` is
 * { id, type: "bin" | "toilet", address, latitude, longitude }. Resolves
 * with the complaint (with `photoWarning` if the photo couldn't be kept).
 * Rejects like the API: 400 with per-field errors, 403 for non-citizens,
 * 409 with `existingId` when the same citizen already has an open report
 * for this facility and category.
 */
export async function createFacilityComplaint({ facility, category, description, photo }) {
  if (apiEnabled()) {
    return remote.createFacility({ facilityType: facility.type, facilityId: facility.id, category, description, photo });
  }
  const user = readSession();
  if (!user) throw new ApiError("Please sign in to continue.", { status: 401 });
  if (user.role !== "citizen") throw new ApiError("You don't have permission to do that.", { status: 403 });
  let data;
  try {
    // The API's own validation: categories per facility type, "Other" needs a description, 500 characters.
    data = validateComplaint({
      facilityType: facility.type,
      facilityId: facility.id,
      category,
      ...(description !== undefined ? { description } : {}),
      ...(photo ? { photo } : {}),
    });
  } catch (err) {
    if (err instanceof ValidationError) throw new ApiError("Please fix the highlighted fields.", { status: 400, fields: err.errors });
    throw err;
  }
  const all = readAll();
  const open = all.find(
    (c) => c.citizenId === user.id && c.facilityId === facility.id && c.category === data.category && c.status !== STATUS.RESOLVED
  );
  if (open) throw new ApiError("You already reported this and it is still open.", { status: 409, existingId: open.id });

  const now = new Date().toISOString();
  const complaint = {
    id: generateComplaintId(all, now),
    citizenId: user.id,
    citizenName: user.name,
    issueType: data.issueType,
    category: data.category,
    facilityType: data.facilityType,
    facilityId: data.facilityId,
    description: data.description,
    location: { address: facility.address || facility.name, latitude: facility.latitude, longitude: facility.longitude },
    priority: data.priority,
    photo: data.photo ?? null,
    status: STATUS.SUBMITTED,
    assignedWorkerId: null,
    assignedWorkerName: null,
    resolutionNote: "",
    createdAt: now,
    updatedAt: now,
  };
  const saved = tryWriteWithPhotoFallback([...all, complaint], complaint.id);
  return data.photo && !saved.photo ? { ...saved, photoWarning: PHOTO_NOT_SAVED } : saved;
}

/**
 * Browser-only build, "delete my data": the user's complaints stay for the
 * municipality without their id, name or photo. Returns how many.
 */
export function anonymiseLocalComplaints(userId) {
  const all = readAll();
  let count = 0;
  const next = all.map((c) => {
    if (c.citizenId !== userId) return c;
    count += 1;
    return { ...c, citizenId: null, citizenName: DELETED_USER_NAME, photo: null };
  });
  if (count) writeAll(next);
  return count;
}

/** How many complaints about this bin or toilet are still open. */
export async function getOpenComplaintCount(facilityId) {
  if (apiEnabled()) return remote.openCount(facilityId);
  return readAll().filter((c) => c.facilityId === facilityId && c.status !== STATUS.RESOLVED).length;
}

// If storing the photo pushes the payload over the browser's storage
// quota, drop just the photo and keep the complaint (never lose the
// citizen's report over an image that's too large for the demo).
function tryWriteWithPhotoFallback(list, newComplaintId) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    notify(list);
  } catch {
    const withoutPhoto = list.map((c) =>
      c.id === newComplaintId ? { ...c, photo: null } : c
    );
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutPhoto));
    } catch {
      // Give up on persistence but keep working in-memory for this session.
    }
    notify(withoutPhoto);
    return withoutPhoto.find((c) => c.id === newComplaintId);
  }
  return list.find((c) => c.id === newComplaintId);
}

export function updateComplaint(id, updates) {
  if (apiEnabled()) {
    // Through the API, officials change only the priority; status and
    // assignment have their own functions (and their own rules on the server).
    const keys = Object.keys(updates);
    if (keys.length === 1 && keys[0] === "priority") return remote.setPriority(id, updates.priority);
    return Promise.reject(new Error(`Can't update ${keys.join(", ")} directly.`));
  }
  const all = readAll();
  const next = all.map((c) =>
    c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
  );
  writeAll(next);
  return next.find((c) => c.id === id) ?? null;
}

/**
 * Records this device's up/down vote on a complaint. Voting the same way
 * again clears the vote; voting the other way switches it. Votes don't
 * bump `updatedAt` — they aren't a status change.
 */
export function voteComplaint(id, direction) {
  if (apiEnabled()) return remote.vote(id, direction);
  const all = readAll();
  const next = all.map((c) => {
    if (c.id !== id) return c;
    const prev = c.myVote ?? null;
    const vote = prev === direction ? null : direction;
    let upvotes = c.upvotes ?? 0;
    let downvotes = c.downvotes ?? 0;
    if (prev === "up") upvotes -= 1;
    if (prev === "down") downvotes -= 1;
    if (vote === "up") upvotes += 1;
    if (vote === "down") downvotes += 1;
    return { ...c, upvotes, downvotes, myVote: vote };
  });
  writeAll(next);
  return next.find((c) => c.id === id) ?? null;
}

export function assignComplaint(id, workerId, workerName) {
  if (apiEnabled()) return remote.assign(id, workerId);
  return updateComplaint(id, {
    status: STATUS.ASSIGNED,
    assignedWorkerId: workerId,
    assignedWorkerName: workerName,
  });
}

export function updateComplaintStatus(id, status, extra = {}) {
  if (apiEnabled()) return remote.setStatus(id, status, extra);
  return updateComplaint(id, { status, ...extra });
}

/** Subscribes to any change in the complaint list. Returns an unsubscribe fn. */
export function subscribe(callback) {
  if (apiEnabled()) return remote.subscribe(callback);
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Whether the list has loaded, and the last error. Always loaded in the browser-only build. */
export function getComplaintsStatus() {
  return apiEnabled() ? remote.getStatus() : { loaded: true, error: null };
}

/** Fetch the list again now (API mode). Resolves when done. */
export function refreshComplaints() {
  return apiEnabled() ? remote.refresh() : Promise.resolve();
}

/** Forget the cached list (API mode) on sign-in / sign-out. */
export function resetComplaintCache() {
  if (apiEnabled()) remote.reset();
}

/**
 * Demo/dev helper — wipes any complaints created during the session and
 * restores the predefined seed complaints (SSB2026-0045..0048) so the
 * demo workflow can be re-run from a clean, known state. Does not
 * touch auth/role or worker-session storage.
 */
export function resetDemoData() {
  const fresh = SEED_COMPLAINTS.map((c) => ({ ...c }));
  writeAll(fresh);
  return fresh;
}
