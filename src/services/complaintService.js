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
  COMPLAINT_ID_PREFIX,
} from "../data/complaints";

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
    // Corrupt/blocked storage — fall back to an empty list below.
  }
  // Nothing stored yet: no complaints ship with the app, and nothing is
  // written until a citizen creates one.
  return [];
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

function generateComplaintId(existing) {
  const numbers = existing
    .map((c) => c.id)
    .filter((id) => id.startsWith(COMPLAINT_ID_PREFIX))
    .map((id) => parseInt(id.slice(COMPLAINT_ID_PREFIX.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${COMPLAINT_ID_PREFIX}${String(next).padStart(4, "0")}`;
}

/** Returns all complaints, newest first. */
export function getComplaints() {
  return [...readAll()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getComplaintById(id) {
  return readAll().find((c) => c.id === id) ?? null;
}

/**
 * Creates a new complaint from validated citizen input and returns it.
 * `data` should already be sanitized/validated by the caller (ReportIssue).
 */
export function createComplaint(data) {
  const all = readAll();
  const now = new Date().toISOString();
  const complaint = {
    id: generateComplaintId(all),
    citizenName: data.citizenName,
    citizenId: data.citizenId ?? null,
    citizenMobile: data.citizenMobile ?? "",
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
  return updateComplaint(id, {
    status: STATUS.ASSIGNED,
    assignedWorkerId: workerId,
    assignedWorkerName: workerName,
  });
}

export function updateComplaintStatus(id, status, extra = {}) {
  return updateComplaint(id, { status, ...extra });
}

/** Subscribes to any change in the complaint list. Returns an unsubscribe fn. */
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Tells subscribers the list changed outside this module (e.g. "Reset all data" cleared storage). */
export function notifyComplaintsChanged() {
  notify(getComplaints());
}
