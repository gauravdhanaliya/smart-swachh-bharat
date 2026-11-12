// The Government Official's own identity — name, district/jurisdiction,
// and department — shown in the sidebar/header chip, the Profile page,
// and the Dashboard subtitle.
//
// Previously these were hard-coded ("District Officer" / "Lucknow
// District") in three separate files. This is the single source of
// truth instead: change it once on the Profile page and every screen
// that reads it (GovShell header, GovDashboard subtitle, the "removed
// by" field on a facility removal record) updates together. Same
// localStorage-with-listeners pattern as services/facilityService.js.

import { CITIES } from "../data/cities";
import { apiEnabled } from "./apiConfig";
import { api } from "./api";
import { INDIAN_STATES } from "../data/indianStates";

const STORAGE_KEY = "ssb_gov_profile_v1";

// Haridwar (Roorkee) is the default jurisdiction — was Lucknow.
export const DEFAULT_GOV_PROFILE = {
  name: "District Officer",
  state: "Uttarakhand",
  district: "Haridwar",
  ministry: "Ministry of Housing & Urban Affairs",
};

// The Profile page's State dropdown offers every state and union
// territory in India (data/indianStates.js).
export const STATE_OPTIONS = INDIAN_STATES;

/**
 * The district / city choices for a given state: its capital first, then
 * any built-in cities from data/cities.js that sit in that state. Every
 * option carries coordinates, so choosing one can re-centre the
 * Dashboard's default map view. Every state has at least its capital.
 */
export function getJurisdictionsForState(stateName) {
  const state = INDIAN_STATES.find((s) => s.name === stateName);
  if (!state) return [];
  const capital = {
    name: state.capital,
    latitude: state.latitude,
    longitude: state.longitude,
  };
  const others = CITIES.filter((c) => c.state === stateName && c.name !== capital.name).map(
    (c) => ({ name: c.name, latitude: c.latitude, longitude: c.longitude })
  );
  return [capital, ...others];
}

/**
 * The state for a saved profile. Profiles saved before the State field
 * existed only have a district, so fall back to looking that district up
 * in data/cities.js rather than showing a blank.
 */
export function getStateForProfile(profile) {
  if (profile?.state) return profile.state;
  return CITIES.find((c) => c.name === profile?.district)?.state ?? "";
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

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return { ...DEFAULT_GOV_PROFILE, ...parsed };
    }
  } catch {
    // Corrupt/blocked storage — fall back to defaults below.
  }
  return { ...DEFAULT_GOV_PROFILE };
}

function write(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Quota/private browsing — the change still applies this session.
  }
  notify();
  return profile;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) notify();
  });
}

// Through the API: the signed-in official's profile (GET/PATCH /api/profile),
// cached in memory and loaded the first time a screen subscribes.
let remoteProfile = null;

/** Fetch the profile again (API mode). */
export async function refreshGovProfile() {
  if (!apiEnabled()) return read();
  const { profile } = await api("/profile");
  remoteProfile = { ...DEFAULT_GOV_PROFILE, ...profile };
  notify();
  return remoteProfile;
}

/** Forget the cached profile (sign-in / sign-out). */
export function resetGovProfileCache() {
  remoteProfile = null;
}

export function getGovProfile() {
  if (apiEnabled()) return remoteProfile ?? { ...DEFAULT_GOV_PROFILE };
  return read();
}

/** Coordinates for the officer's chosen district, for re-centring a map. */
export function getGovJurisdictionCenter() {
  const profile = getGovProfile();
  const match = getJurisdictionsForState(getStateForProfile(profile)).find(
    (j) => j.name === profile.district
  );
  return match ? { latitude: match.latitude, longitude: match.longitude } : null;
}

/** Saves profile changes. A Promise through the API (which validates them). */
export function updateGovProfile(partial) {
  if (apiEnabled()) {
    const fields = Object.fromEntries(
      ["name", "state", "district", "ministry"].filter((k) => partial[k] !== undefined).map((k) => [k, partial[k]])
    );
    return api("/profile", { method: "PATCH", body: fields }).then(({ profile }) => {
      remoteProfile = { ...DEFAULT_GOV_PROFILE, ...profile };
      notify();
      return remoteProfile;
    });
  }
  return write({ ...read(), ...partial });
}

export function subscribe(callback) {
  listeners.add(callback);
  if (apiEnabled() && !remoteProfile) refreshGovProfile().catch(() => {});
  return () => listeners.delete(callback);
}
