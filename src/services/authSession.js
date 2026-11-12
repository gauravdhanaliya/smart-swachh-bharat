// The signed-in session, kept in localStorage so a refresh keeps it.
//
// Two ways to sign in:
//   - "demo": pick a role on the login screen. Each role signs in as a fixed
//     demo user whose id matches the seeded data — the worker is "w1"
//     (Vikash Kumar), who owns the seeded tasks and facility requests.
//   - "otp":  a real phone number verified by Firebase (services/authService.js).
//     An OTP user is ALWAYS a citizen; worker and official access exist only
//     through the demo login.
//
// Stored fields: { id, name, role, method, loginAt } plus a masked `phone`
// for OTP sessions. The full phone number, the OTP and Firebase's
// confirmation object are never stored.
//
// There is no backend, so this is a client-side guard, not server security.

import { maskPhone, validatePhone } from "../utils/phoneAuth";

const STORAGE_KEY = "ssb_auth_session_v1";

// Earlier builds' auth storage (OTP demo, Firebase/JWT builds).
const LEGACY_KEYS = ["ssb_auth_state", "ssb_api_token_v1", "ssb_api_role_v1"];

export const LOGIN_METHOD = { DEMO: "demo", OTP: "otp" };

export const OTP_ROLE = "citizen";
const OTP_USER_NAME = "Citizen";

export const DEMO_USERS = {
  citizen: { id: "demo-citizen", name: "Demo Citizen" },
  worker: { id: "w1", name: "Demo Worker" },
  official: { id: "demo-official", name: "Demo Official" },
};

export const ROLE_HOME = {
  citizen: "/citizen",
  worker: "/worker",
  official: "/official",
};

export const DEMO_IDS = new Set(Object.values(DEMO_USERS).map((u) => u.id));

function isValidDemo(s) {
  return Boolean(DEMO_USERS[s.role]) && s.id === DEMO_USERS[s.role].id;
}

// An OTP session is only ever a citizen, and can't borrow a demo user's id.
function isValidOtp(s) {
  return s.role === OTP_ROLE && typeof s.id === "string" && s.id !== "" && !DEMO_IDS.has(s.id);
}

export function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (!s || typeof s !== "object" || typeof s.name !== "string") return null;
    // Sessions saved before login methods existed were all demo sessions.
    const method = s.method ?? LOGIN_METHOD.DEMO;
    if (method === LOGIN_METHOD.DEMO && isValidDemo(s)) return { ...s, method };
    if (method === LOGIN_METHOD.OTP && isValidOtp(s)) return s;
  } catch {
    // malformed or blocked storage — treat as signed out
  }
  return null;
}

function save(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // storage blocked — the session still lives in memory until the tab closes
  }
  return session;
}

/** Starts a demo session for `role`. A blank name falls back to the role's demo name. */
export function startSession(role, name) {
  const demo = DEMO_USERS[role];
  if (!demo) throw new Error(`Unknown role: ${role}`);
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return save({
    id: demo.id,
    name: clean || demo.name,
    role,
    method: LOGIN_METHOD.DEMO,
    loginAt: new Date().toISOString(),
  });
}

/**
 * Starts a session for a phone-verified user. The role is fixed to citizen
 * here — nothing the caller passes can change it.
 */
export function startOtpSession({ uid, phone }) {
  if (typeof uid !== "string" || uid === "" || DEMO_IDS.has(uid)) throw new Error("A Firebase uid is required.");
  if (!validatePhone(phone).ok) throw new Error("A valid phone number is required.");
  return save({
    id: uid,
    name: OTP_USER_NAME,
    role: OTP_ROLE,
    method: LOGIN_METHOD.OTP,
    phone: maskPhone(phone),
    loginAt: new Date().toISOString(),
  });
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

export function clearLegacySessions() {
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage blocked — nothing to clean
  }
}

export function isSessionKey(key) {
  return key === STORAGE_KEY;
}
