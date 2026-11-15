// The signed-in session in the browser-only build, kept in localStorage so a
// refresh keeps it. (With VITE_USE_API=true the server's session is used
// instead: services/session.js.)
//
// Ways in:
//   - "email": an email + password account (Log in, or Create account).
//     Always a citizen here: staff roles come only from the server.
//   - "demo": the labelled demo login ("Try the demo"). Each role signs in
//     as a fixed demo user whose id matches the seeded data (the worker is "w1").
// There is no anonymous sign-in: a session an earlier build saved for
// "Continue without account" reads as signed out.
//
// Stored fields: { id, name, role, method, loginAt } plus, for an email
// account, the masked `email` and `emailVerified`. Never a password or a token.
//
// There is no backend, so this is a client-side guard, not server security.

const STORAGE_KEY = "ssb_auth_session_v1";
// What this device agreed to on the start screen (consentService).
const DEVICE_CONSENT_KEY = "ssb_device_consent_v1";

// Earlier builds' auth storage (OTP demo, Firebase/JWT builds, and the
// flags of "Continue without account").
const LEGACY_KEYS = ["ssb_auth_state", "ssb_api_token_v1", "ssb_api_role_v1", "ssb_signed_out_v1", "ssb_local_citizen_id_v1", "ssb_continued_anon_v1"];

export const LOGIN_METHOD = { DEMO: "demo", EMAIL: "email", LEGACY: "legacy" };
const CITIZEN_METHODS = new Set([LOGIN_METHOD.EMAIL, LOGIN_METHOD.LEGACY]);

export const CITIZEN_ROLE = "citizen";
const CITIZEN_NAME = "citizen";

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

/** "asha.verma@example.test" -> "as***@e***.test" (the same mask the server uses). */
export function maskEmail(email) {
  const normal = String(email ?? "").trim().toLowerCase();
  const m = /^([^\s@]+)@([^\s@]+)\.([^\s@.]+)$/.exec(normal);
  if (!m) return null;
  const [, local, name, tld] = m;
  return `${local.slice(0, Math.min(2, local.length - 1) || 1)}***@${name[0]}***.${tld}`;
}

function isValidDemo(s) {
  return Boolean(DEMO_USERS[s.role]) && s.id === DEMO_USERS[s.role].id;
}

// A citizen session is only ever a citizen, and can't borrow a demo user's id.
function isValidCitizen(s) {
  return s.role === CITIZEN_ROLE && typeof s.id === "string" && s.id !== "" && !DEMO_IDS.has(s.id);
}

const clean = (name) => String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

export function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (!s || typeof s !== "object" || typeof s.name !== "string") return null;
    // Sessions saved before login methods existed were all demo sessions.
    const method = s.method ?? LOGIN_METHOD.DEMO;
    if (method === LOGIN_METHOD.DEMO && isValidDemo(s)) return { ...s, method };
    // "anonymous" and "otp" sessions from earlier builds: signed out.
    if (CITIZEN_METHODS.has(method) && isValidCitizen(s)) return s;
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
  return save({
    id: demo.id,
    name: clean(name) || demo.name,
    role,
    method: LOGIN_METHOD.DEMO,
    loginAt: new Date().toISOString(),
  });
}

/**
 * Starts the session of an email account. The role is fixed to citizen here:
 * nothing the caller passes can change it. Only the masked email is kept.
 */
export function startEmailSession({ uid, email, emailVerified = false, name }) {
  if (typeof uid !== "string" || uid === "" || DEMO_IDS.has(uid)) throw new Error("An account id is required.");
  const masked = maskEmail(email);
  if (!masked) throw new Error("An email address is required.");
  return save({
    id: uid,
    name: clean(name) || CITIZEN_NAME,
    role: CITIZEN_ROLE,
    method: LOGIN_METHOD.EMAIL,
    email: masked,
    emailVerified: Boolean(emailVerified),
    loginAt: new Date().toISOString(),
  });
}

/** Changes the name, or whether the email is verified, of the current session. */
export function updateSession({ name, emailVerified } = {}) {
  const current = readSession();
  if (!current) return null;
  const next = { ...current };
  if (name !== undefined) next.name = clean(name) || current.name;
  if (emailVerified !== undefined && current.method === LOGIN_METHOD.EMAIL) next.emailVerified = Boolean(emailVerified);
  return save(next);
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * Someone logged out (or withdrew consent, or deleted their data): this
 * device forgets what it agreed to on the start screen, so the next person
 * using it is asked again.
 */
export function markSignedOut() {
  try {
    localStorage.removeItem(DEVICE_CONSENT_KEY);
  } catch {
    // storage blocked
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
