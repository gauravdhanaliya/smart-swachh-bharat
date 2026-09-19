// Step 14D — Single source of truth for facilities (bins + toilets).
//
// ROOT CAUSE this file fixes: Government "Add Facility" had no persistence
// layer at all, and the Citizen Map + Government Bins/Toilets pages were
// each reading a *different* data source (static src/data/bins.js /
// src/data/toilets.js arrays, imported directly and never merged with
// anything Government created). So a Government-added facility had
// nowhere shared to live, and the Citizen Map had no way to ever see it.
//
// This module is the fix: it is the ONE place that combines
//   1. existing demo bins/toilets            (src/data/bins.js, toilets.js)
//   2. Government-added facilities            (this file, localStorage)
//   3. Government-approved Worker requests    (services/facilityRequestService.js)
// into the arrays every screen (Government AND Citizen) now reads from.
//
// Mirrors the existing services/complaintService.js and
// services/facilityRequestService.js pattern: data lives in localStorage
// for this prototype; only readGovFacilities/writeGovFacilities need to
// change when a real backend exists. Every screen already calls
// getAllBins/getAllToilets/addGovernmentFacility, not localStorage
// directly, so swapping this file's internals for real
// `POST /api/facilities` + `GET /api/facilities` calls later won't
// require touching any UI code.

import { bins as demoBins, statusFromFillLevel, BIN_STATUS } from "../data/bins";
import { toilets as demoToilets, TOILET_STATUS } from "../data/toilets";
import {
  getFacilityRequests,
  subscribe as subscribeFacilityRequests,
} from "./facilityRequestService";
import { FACILITY_TYPE, REQUEST_STATUS, isoNow } from "../data/facilityRequests";

export const FACILITY_SOURCE = {
  DEMO: "DEMO",
  GOVERNMENT: "GOVERNMENT",
  WORKER_APPROVED: "WORKER_APPROVED",
  LIVE_GPS: "LIVE_GPS",
};

const STORAGE_KEY = "ssb_gov_facilities_v1";

// Step 14E — "Remove Facility" (the mirror of "Add Facility").
//
// Removal is stored as a *tombstone list* rather than by mutating the
// source arrays, because a facility can come from three different
// places (static demo seed, Government-added localStorage, derived from
// an approved Worker request) and only one of those is actually
// writable. A tombstone works uniformly for all three, keeps removal
// reversible (Undo / Restore), and gives Government an auditable record
// of what was taken off the map and why — which is what a real
// `DELETE /api/facilities/:id` endpoint would log server-side.
const REMOVED_STORAGE_KEY = "ssb_removed_facilities_v1";

export const REMOVAL_REASONS = {
  bin: [
    "Bin permanently removed from site",
    "Relocated to a different location",
    "Damaged beyond repair",
    "Duplicate entry",
    "Added by mistake",
  ],
  toilet: [
    "Facility permanently closed",
    "Demolished / under redevelopment",
    "Handed over to another agency",
    "Duplicate entry",
    "Added by mistake",
  ],
};

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

function readGovFacilities() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupt/blocked storage — fall back to an empty list below.
  }
  return [];
}

function writeGovFacilities(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage unavailable (private browsing, etc).
    // The in-memory read on next call will just miss this write —
    // acceptable for the demo, never throws and blocks the UI.
  }
  notify();
  return list;
}

function readRemovedFacilities() {
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

function writeRemovedFacilities(list) {
  try {
    localStorage.setItem(REMOVED_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Same tolerance as writeGovFacilities: never throw and block the UI.
  }
  notify();
  return list;
}

// Keep every open tab/component in sync when Government adds or removes
// a facility in another tab (cross-tab demo, e.g. Government on a laptop
// + Citizen on a phone both open against the same deployed build).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === REMOVED_STORAGE_KEY) notify();
  });
}

// Approving/rejecting a Worker facility request also changes what the
// combined facility list should contain, so re-notify our own
// subscribers whenever that store changes too.
subscribeFacilityRequests(() => notify());

function generateFacilityId(prefix, existingIds) {
  const numbers = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

/** Government-added dustbins (raw, no demo/approved data mixed in). */
export function getGovernmentBins() {
  return readGovFacilities().filter((f) => f.category === "bin");
}

/** Government-added public toilets (raw, no demo/approved data mixed in). */
export function getGovernmentToilets() {
  return readGovFacilities().filter((f) => f.category === "toilet");
}

function deriveArea(address) {
  if (!address) return "";
  return address.split(",")[0].trim();
}

// A Government-approved Worker facility request becomes a real,
// map-visible facility. Kept as a *derived* list (computed from
// facilityRequestService, not duplicated into localStorage) so approving
// a request can never fall out of sync with the facility it produces.
function approvedWorkerBins() {
  return getFacilityRequests()
    .filter((r) => r.status === REQUEST_STATUS.APPROVED && r.facilityType === FACILITY_TYPE.DUSTBIN)
    .map((r) => ({
      id: `WB-${r.id}`,
      name: r.suggestedName || "Worker-Requested Dustbin",
      latitude: r.location.latitude,
      longitude: r.location.longitude,
      area: deriveArea(r.location.address),
      type: "Mixed Waste",
      fillLevel: 0,
      status: BIN_STATUS.NORMAL,
      lastUpdated: "Approved",
      address: r.location.address,
      locationLabel: "Worker-Requested · Government Approved",
      history: [0, 0, 0, 0, 0, 0],
      source: FACILITY_SOURCE.WORKER_APPROVED,
      requestId: r.id,
    }));
}

function approvedWorkerToilets() {
  return getFacilityRequests()
    .filter((r) => r.status === REQUEST_STATUS.APPROVED && r.facilityType === FACILITY_TYPE.TOILET)
    .map((r) => ({
      id: `WT-${r.id}`,
      name: r.suggestedName || "Worker-Requested Public Toilet",
      latitude: r.location.latitude,
      longitude: r.location.longitude,
      area: deriveArea(r.location.address),
      status: TOILET_STATUS.OPEN,
      openingHours: "Not specified yet",
      cleanliness: 3,
      distance: "",
      address: r.location.address,
      locationLabel: "Worker-Requested · Government Approved",
      lastUpdated: "Approved",
      facilities: ["Men", "Women"],
      source: FACILITY_SOURCE.WORKER_APPROVED,
      requestId: r.id,
    }));
}

/**
 * GET /api/facilities (bins slice).
 * Demo bins + Government-added bins + Government-approved Worker bins.
 * This — not src/data/bins.js directly — is what every bin-map screen
 * (Government AND Citizen) should read from from now on.
 */
export function getAllBins() {
  const removed = removedIdSet();
  return [
    ...demoBins.map((b) => ({ ...b, source: b.source ?? FACILITY_SOURCE.DEMO })),
    ...getGovernmentBins(),
    ...approvedWorkerBins(),
  ].filter((b) => !removed.has(b.id));
}

/**
 * GET /api/facilities (toilets slice).
 * Demo toilets + Government-added toilets + Government-approved Worker toilets.
 */
export function getAllToilets() {
  const removed = removedIdSet();
  return [
    ...demoToilets.map((t) => ({ ...t, source: t.source ?? FACILITY_SOURCE.DEMO })),
    ...getGovernmentToilets(),
    ...approvedWorkerToilets(),
  ].filter((t) => !removed.has(t.id));
}

/**
 * POST /api/facilities — Government "Add Facility" (Dustbin or Public
 * Toilet). Persists to the shared facility store so it is immediately
 * part of getAllBins()/getAllToilets() — i.e. immediately visible on
 * both the Government map/list AND the Citizen Bin & Toilet Map.
 *
 * `data` should already be validated by the caller (GovAddFacility page):
 *   { facilityType: "Dustbin" | "Public Toilet", name, address,
 *     latitude, longitude, area?, type?, fillLevel?,
 *     openingHours?, facilities?, cleanliness? }
 */
export function addGovernmentFacility(data) {
  const all = readGovFacilities();
  const now = isoNow();
  let facility;

  if (data.facilityType === FACILITY_TYPE.DUSTBIN) {
    const id = generateFacilityId(
      "GB-",
      all.filter((f) => f.category === "bin").map((f) => f.id)
    );
    const fillLevel = Number.isFinite(data.fillLevel) ? data.fillLevel : 0;
    facility = {
      id,
      category: "bin",
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      area: data.area || deriveArea(data.address),
      type: data.type || "Mixed Waste",
      fillLevel,
      status: statusFromFillLevel(fillLevel),
      lastUpdated: "Just now",
      address: data.address,
      locationLabel: "Government Added",
      history: [0, 0, 0, 0, 0, fillLevel],
      source: FACILITY_SOURCE.GOVERNMENT,
      createdAt: now,
    };
  } else {
    const id = generateFacilityId(
      "GT-",
      all.filter((f) => f.category === "toilet").map((f) => f.id)
    );
    facility = {
      id,
      category: "toilet",
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      area: data.area || deriveArea(data.address),
      status: data.status || TOILET_STATUS.OPEN,
      openingHours: data.openingHours || "6:00 AM – 10:00 PM",
      cleanliness: Number.isFinite(data.cleanliness) ? data.cleanliness : 4,
      distance: "",
      address: data.address,
      locationLabel: "Government Added",
      lastUpdated: "Just now",
      facilities: data.facilities?.length ? data.facilities : ["Men", "Women"],
      source: FACILITY_SOURCE.GOVERNMENT,
      createdAt: now,
    };
  }

  const next = [...all, facility];
  writeGovFacilities(next);
  return facility;
}

// ---------------------------------------------------------------------
// Step 14E — DELETE /api/facilities/:id  (Government "Remove Facility")
// ---------------------------------------------------------------------

function removedIdSet() {
  return new Set(readRemovedFacilities().map((r) => r.id));
}

function inferCategory(facility) {
  if (facility?.category === "bin" || facility?.category === "toilet") return facility.category;
  return typeof facility?.fillLevel === "number" ? "bin" : "toilet";
}

/**
 * Every facility Government has taken off the map, newest first.
 * Each entry: { id, category, name, address, source, reason, removedBy, removedAt }.
 */
export function getRemovedFacilities(category) {
  const list = readRemovedFacilities()
    .slice()
    .sort((a, b) => String(b.removedAt).localeCompare(String(a.removedAt)));
  return category ? list.filter((r) => r.category === category) : list;
}

/** True if this facility id is currently hidden from every screen. */
export function isFacilityRemoved(id) {
  return removedIdSet().has(id);
}

/**
 * DELETE /api/facilities/:id — the mirror of addGovernmentFacility().
 * Takes the facility object straight off the card (so the removal record
 * keeps its name/address for the audit trail) and hides it everywhere
 * getAllBins()/getAllToilets() is read: the Government Bins & Public
 * Toilets pages, the Government dashboard counts, and the Citizen Bin &
 * Toilet Map. Reversible via restoreFacility().
 *
 * Returns the removal record, or null if the id was already removed.
 */
export function removeFacility(facility, options = {}) {
  const id = typeof facility === "string" ? facility : facility?.id;
  if (!id) return null;

  const current = readRemovedFacilities();
  if (current.some((r) => r.id === id)) return null;

  const record = {
    id,
    category: options.category || inferCategory(facility),
    name: (typeof facility === "object" && facility?.name) || id,
    address: (typeof facility === "object" && facility?.address) || "",
    source: (typeof facility === "object" && facility?.source) || FACILITY_SOURCE.DEMO,
    reason: (options.reason || "").trim() || "No reason recorded",
    removedBy: options.removedBy || "District Officer",
    removedAt: isoNow(),
  };

  writeRemovedFacilities([...current, record]);
  return record;
}

/** Undo a removal — the facility reappears on every screen immediately. */
export function restoreFacility(id) {
  const current = readRemovedFacilities();
  const next = current.filter((r) => r.id !== id);
  if (next.length === current.length) return false;
  writeRemovedFacilities(next);
  return true;
}

/** Restore everything (optionally just bins, or just toilets). */
export function restoreAllFacilities(category) {
  const next = category
    ? readRemovedFacilities().filter((r) => r.category !== category)
    : [];
  writeRemovedFacilities(next);
  return next;
}

/** Subscribes to any change (Government add, Worker approval/rejection, cross-tab). */
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Demo/dev helper — wipes Government-added facilities AND un-removes
 * anything removed during the session, so a fresh demo run starts from
 * the same seed state every time.
 */
export function resetDemoData() {
  writeRemovedFacilities([]);
  writeGovFacilities([]);
  return [];
}
