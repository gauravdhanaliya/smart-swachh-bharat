// Facilities (bins + toilets + campus buildings).
//
// Single source of truth: the EcoSetu API (server/). This module keeps the
// same function names every screen already imports — getAllBins(),
// getAllToilets(), addGovernmentFacility(), removeFacility() … — but they
// now read from the synced cache in locationStore.js and write through the
// API, which enforces permissions (only officials may add/edit/remove).
//
// Reads are synchronous (cached); writes return Promises that reject with
// an ApiError carrying the server's message and per-field errors.

import { api } from "./api";
import {
  binToPayload,
  toiletToPayload,
  locationToBin,
  locationToToilet,
  locationToBuilding,
} from "./locationAdapters";
import {
  getDerived,
  getRemovedLocations,
  refreshFresh,
  subscribe as subscribeStore,
} from "./locationStore";
import { FACILITY_TYPE } from "../data/facilityRequests";

export const FACILITY_SOURCE = {
  DEMO: "DEMO",
  GOVERNMENT: "GOVERNMENT",
  WORKER_APPROVED: "WORKER_APPROVED",
  VERIFIED: "VERIFIED",
};

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
  building: ["Building demolished", "Duplicate entry", "Added by mistake", "Incorrect coordinates"],
};

/** GET /api/locations (dustbins). */
export const getAllBins = () => getDerived().bins;
/** GET /api/locations (public toilets). */
export const getAllToilets = () => getDerived().toilets;
/** GET /api/locations (campus buildings, gates, library, hostels …). */
export const getAllBuildings = () => getDerived().buildings;

export function subscribe(callback) {
  return subscribeStore(callback);
}

/**
 * POST /api/locations. `data` is the shape GovAddFacility builds:
 *   { facilityType: "Dustbin" | "Public Toilet" | "Building", buildingType?, name, address,
 *     latitude, longitude, type?, fillLevel?, openingHours?, facilities?, description? }
 * Resolves with the created facility in the same shape the screens use.
 */
export async function addGovernmentFacility(data) {
  const payload = toPayload(data);
  const { location } = await api("/locations", { method: "POST", body: payload });
  await refreshFresh();
  return fromLocation(location);
}

/** PATCH /api/locations/:id — edit any facility or building. */
export async function updateFacility(id, data) {
  const { location } = await api(`/locations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: toPayload(data),
  });
  await refreshFresh();
  return fromLocation(location);
}

function toPayload(data) {
  if (data.facilityType === FACILITY_TYPE.DUSTBIN) return binToPayload(data);
  if (data.facilityType === FACILITY_TYPE.TOILET) return toiletToPayload(data);
  return {
    name: data.name,
    type: data.buildingType,
    latitude: data.latitude,
    longitude: data.longitude,
    address: data.address,
    description: data.description ?? "",
    ...(data.status ? { status: data.status } : {}),
  };
}

function fromLocation(l) {
  if (l.type === "dustbin") return locationToBin(l);
  if (l.type === "public_toilet") return locationToToilet(l);
  return locationToBuilding(l);
}

function categoryOf(l) {
  if (l.type === "dustbin") return "bin";
  if (l.type === "public_toilet") return "toilet";
  return "building";
}

/**
 * Every facility taken off the map, newest first.
 * Each entry: { id, category, name, address, source, reason, removedBy, removedAt }.
 */
export function getRemovedFacilities(category) {
  const list = getRemovedLocations().map((l) => ({
    id: l.id,
    category: categoryOf(l),
    name: l.name,
    address: l.address,
    source: l.isDemo ? FACILITY_SOURCE.DEMO : FACILITY_SOURCE.GOVERNMENT,
    reason: l.removalReason,
    removedBy: l.removedBy,
    removedAt: l.removedAt,
  }));
  return category ? list.filter((r) => r.category === category) : list;
}

/** DELETE /api/locations/:id (soft delete — reversible via restoreFacility). */
export async function removeFacility(facility, options = {}) {
  const id = typeof facility === "string" ? facility : facility?.id;
  if (!id) return null;
  const reason = (options.reason || "").trim() || "No reason recorded";
  await api(`/locations/${encodeURIComponent(id)}`, { method: "DELETE", body: { reason } });
  await refreshFresh();
  return {
    id,
    category: options.category || (typeof facility === "object" ? facility.category : undefined),
    name: (typeof facility === "object" && facility?.name) || id,
    address: (typeof facility === "object" && facility?.address) || "",
    reason,
    removedBy: options.removedBy || "",
    removedAt: new Date().toISOString(),
  };
}

/** POST /api/locations/:id/restore. */
export async function restoreFacility(id) {
  await api(`/locations/${encodeURIComponent(id)}/restore`, { method: "POST" });
  await refreshFresh();
  return true;
}

/** Restore everything (optionally just one category). */
export async function restoreAllFacilities(category) {
  const targets = getRemovedFacilities(category);
  await Promise.all(targets.map((t) => api(`/locations/${encodeURIComponent(t.id)}/restore`, { method: "POST" })));
  await refreshFresh();
  return [];
}
