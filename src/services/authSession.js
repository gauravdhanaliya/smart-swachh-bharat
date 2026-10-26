// Open demo sign-in: anyone picks a role on the login screen and gets a local
// session { id, name, role, loginAt }, kept in localStorage so a refresh keeps
// it. There is no password, OTP or server check — this is a demo build.
//
// Each role signs in as a fixed demo user whose id matches the seeded data:
// the worker is "w1" (Vikash Kumar), who owns the seeded tasks and facility
// requests.

const STORAGE_KEY = "ssb_auth_session_v1";

// Earlier builds' auth storage (OTP demo, Firebase/JWT builds).
const LEGACY_KEYS = ["ssb_auth_state", "ssb_api_token_v1", "ssb_api_role_v1"];

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

export function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s && DEMO_USERS[s.role] && s.id === DEMO_USERS[s.role].id && typeof s.name === "string") {
      return s;
    }
  } catch {
    // malformed or blocked storage — treat as signed out
  }
  return null;
}

/** Starts a session for `role`. A blank name falls back to the role's demo name. */
export function startSession(role, name) {
  const demo = DEMO_USERS[role];
  if (!demo) throw new Error(`Unknown role: ${role}`);
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const session = { id: demo.id, name: clean || demo.name, role, loginAt: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // storage blocked — the session still lives in memory until the tab closes
  }
  return session;
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
