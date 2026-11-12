// Privacy consent, withdrawing it, and "delete my data" (Feature 5).
//
// Every call goes through api(): the EcoSetu API with VITE_USE_API=true, the
// browser-only stand-in otherwise (services/api.js, same paths and rules).
//
//   withdrawConsent(): stops new collection and signs out; the data is KEPT.
//   deleteMyData():    deletes the account and personal data; complaints are
//                      kept for the municipality, anonymised.

import { api } from "./api";
import { apiEnabled } from "./apiConfig";
import { readSession } from "./authSession";
import { anonymiseLocalComplaints } from "./complaintService";

// Consent known to be up to date, per user id, so every page doesn't ask the server again.
const accepted = new Set();
const resetListeners = new Set();
export const consentKnownAccepted = (userId) => accepted.has(userId);
export const clearConsentCache = () => accepted.clear();

/** Called when consent was reset (the consent gate checks again). Returns an unsubscribe function. */
export function onConsentReset(callback) {
  resetListeners.add(callback);
  return () => resetListeners.delete(callback);
}

/** { version, consent: { version, acceptedAt, items } | null, upToDate }. */
export async function getConsentStatus(userId) {
  const state = await api("/me/consent");
  if (userId && state.upToDate) accepted.add(userId);
  return state;
}

/** Accepts the privacy notice `version` with the ticked `items`. 409 if the notice changed meanwhile. */
export async function acceptConsent(version, items, userId) {
  const state = await api("/me/consent", { method: "PUT", body: { version, items } });
  if (userId && state.upToDate) accepted.add(userId);
  return state;
}

/** Withdraws consent: the server ends every session; the data is kept. */
export async function withdrawConsent() {
  accepted.clear();
  return api("/me/consent", { method: "DELETE" });
}

/** Demo accounts only (presentations): every demo account sees the consent screen again. */
export async function resetDemoConsent() {
  const res = await api("/me/consent/reset-demo", { method: "POST" });
  accepted.clear();
  for (const cb of resetListeners) cb();
  return res;
}

// What this device remembers for the person using it (not shared data).
const DEVICE_KEYS = ["ssb_citizen_prefs_v1", "ssb_citizen_notifications_seen_v1", "ssb_citizen_city_v1"];
const SESSION_KEYS = ["ssb_geo_cache_v1", "ssb_gps_ack_v1"];

function forgetOnThisDevice() {
  for (const [store, keys] of [
    [localStorage, DEVICE_KEYS],
    [sessionStorage, SESSION_KEYS],
  ]) {
    for (const key of keys) {
      try {
        store.removeItem(key);
      } catch {
        // storage blocked: nothing stored either
      }
    }
  }
}

/**
 * Deletes the signed-in user's data (server first; the Firebase sign-in is
 * removed afterwards by the delete flow). Resolves with what was deleted and
 * what was kept anonymised. The shared demo accounts get a 403.
 */
export async function deleteMyData() {
  const user = readSession();
  const res = await api("/me/data", { method: "DELETE", body: { confirm: true } });
  if (!apiEnabled() && user) {
    // Browser-only build: complaints live in their own store.
    res.anonymised = { ...(res.anonymised ?? {}), complaints: anonymiseLocalComplaints(user.id) };
  }
  forgetOnThisDevice();
  accepted.clear();
  return res;
}
