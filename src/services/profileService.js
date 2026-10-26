// The person behind each role: filled in on the "Complete your profile"
// screen at first login, and read wherever the app shows who you are
// (greetings, profile pages, complaint forms, task headers, official
// screens). One profile per role, kept in localStorage.

import { getAllCities } from "./cityService";
import { INDIA_CENTER } from "../data/facilityRequests";

const STORAGE_KEY = "ecosetu_profiles_v1";

export const ROLES = ["citizen", "worker", "official"];

const MAX = { fullName: 60, ward: 60, address: 160, zone: 60, employeeId: 24, department: 80, designation: 60 };

const FIELDS = {
  citizen: ["fullName", "mobile", "cityId", "ward", "address"],
  worker: ["fullName", "mobile", "cityId", "zone", "employeeId"],
  official: ["fullName", "mobile", "cityId", "department", "designation"],
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

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Corrupt/blocked storage — behave as if no profiles exist.
  }
  return {};
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) notify();
  });
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function getProfile(role) {
  const p = readAll()[role];
  return p && typeof p === "object" && p.fullName ? p : null;
}

export function hasProfile(role) {
  return getProfile(role) !== null;
}

/** Field errors for a profile form ({} when valid). */
export function validateProfile(role, data) {
  const errors = {};
  if (clean(data.fullName).length < 2) errors.fullName = "Please enter your full name.";
  const mobile = clean(data.mobile).replace(/\s/g, "");
  if (mobile && !/^[6-9]\d{9}$/.test(mobile)) errors.mobile = "Enter a 10-digit mobile number, or leave it blank.";
  if (!data.cityId || !getAllCities().some((c) => c.id === data.cityId)) errors.cityId = "Please choose your city.";
  if (role === "worker" && !clean(data.zone)) errors.zone = "Please enter your assigned ward or zone.";
  return errors;
}

/** Validates and stores the profile for `role`. Throws if invalid; returns the saved profile. */
export function saveProfile(role, data) {
  if (!FIELDS[role]) throw new Error(`Unknown role: ${role}`);
  const errors = validateProfile(role, data);
  if (Object.keys(errors).length) throw Object.assign(new Error("Invalid profile"), { errors });

  const city = getAllCities().find((c) => c.id === data.cityId);
  const profile = { role, updatedAt: new Date().toISOString() };
  for (const field of FIELDS[role]) {
    profile[field] = field === "mobile" ? clean(data.mobile).replace(/\s/g, "") : clean(data[field]).slice(0, MAX[field] ?? 80);
  }
  profile.cityId = city.id;
  profile.city = {
    id: city.id,
    name: city.name,
    state: city.state ?? "",
    district: city.district ?? "",
    latitude: city.latitude,
    longitude: city.longitude,
  };

  const all = readAll();
  all[role] = profile;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage blocked — the profile is lost on reload, nothing else breaks
  }
  notify();
  return profile;
}

export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Tells subscribers the profiles changed outside this module (e.g. "Reset all data"). */
export function notifyProfilesChanged() {
  notify();
}

/** Where this user's maps open: their city, or the centre of India. */
export function cityCenter(profile) {
  const c = profile?.city;
  return c && Number.isFinite(c.latitude) ? { latitude: c.latitude, longitude: c.longitude } : INDIA_CENTER;
}

/** The user's own city as a one-tap "Known area" for location pickers. */
export function cityPresets(profile) {
  const c = profile?.city;
  if (!c || !Number.isFinite(c.latitude)) return [];
  return [{ address: c.state ? `${c.name}, ${c.state}` : c.name, latitude: c.latitude, longitude: c.longitude }];
}

/** First name for greetings ("Asha Verma" → "Asha"). */
export function firstName(profile) {
  return clean(profile?.fullName).split(" ")[0] || "";
}
