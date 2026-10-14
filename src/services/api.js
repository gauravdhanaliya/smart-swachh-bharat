// Thin client for the EcoSetu API (server/). Same-origin `/api` by default
// (Vite proxies it to the API in development); set VITE_API_BASE_URL when
// the API is hosted elsewhere.
//
// Session: Firebase proves the phone number once; the server then issues a
// short-lived access token (kept ONLY in memory here — never in storage) and a
// refresh token that the browser holds in an httpOnly cookie this code can't
// read. A 401 triggers one silent refresh and retry; if that fails the
// session is over and the app is told to sign the user out.

const BASE = (import.meta.env?.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, { status = 0, fields = null } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

let accessToken = null;
let sessionRole = null;
let refreshInFlight = null;
let onSessionLost = () => {};

/** Role the server granted this session (set by AuthContext). UI hint only — the server re-checks it. */
export function getTokenRole() {
  return sessionRole;
}

export function setSessionRole(role) {
  sessionRole = role ?? null;
}

/** AuthContext registers what to do when a session can't be refreshed. */
export function setSessionLostHandler(fn) {
  onSessionLost = fn;
}

async function send(path, { method = "GET", body, signal } = {}, token) {
  try {
    return await fetch(`${BASE}/api${path}`, {
      method,
      signal,
      // The refresh cookie travels with every request; cross-origin APIs need "include".
      credentials: BASE ? "include" : "same-origin",
      headers: {
        "X-EcoSetu-Client": "web",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the EcoSetu server. Check that it is running and try again.");
  }
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null; // empty or non-JSON body
  }
}

async function toResult(res) {
  const data = await readJson(res);
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status}).`, {
      status: res.status,
      fields: data?.fields ?? null,
    });
  }
  return data;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Exchanges the refresh cookie for a new access token. One request at a time
 * (React StrictMode, several calls failing together…): refresh tokens are
 * single-use, so concurrent refreshes would invalidate each other.
 * Resolves with { user } on success or null if there is no valid session.
 */
export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await send("/auth/refresh", { method: "POST" });
        if (res.ok) {
          const data = await readJson(res);
          accessToken = data.accessToken;
          return { user: data.user };
        }
        // Another tab may be rotating the cookie right now — give it a moment, once.
        if (res.status === 401 && attempt === 0) await wait(600);
        else break;
      }
      accessToken = null;
      return null;
    })()
      .catch(() => null) // server unreachable: no usable session right now
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Calls the API with the in-memory access token; refreshes once on a 401. */
export async function api(path, opts = {}) {
  let res = await send(path, opts, accessToken);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const hadSession = accessToken !== null;
    const refreshed = await refreshSession();
    if (refreshed) res = await send(path, opts, accessToken);
    else if (hadSession) onSessionLost();
  }
  return toResult(res);
}

/**
 * POST /api/auth/firebase-login — the server verifies the Firebase ID token and
 * starts the session. The role is whatever the server holds for this account
 * (new accounts are citizens); the client has no say in it. Returns the user.
 */
export async function loginToApi({ idToken }) {
  const data = await api("/auth/firebase-login", {
    method: "POST",
    body: { idToken },
  });
  accessToken = data.accessToken;
  return data.user;
}

/** Ends the session on the server (revokes the refresh token) and forgets the access token. */
export async function logoutFromApi() {
  accessToken = null;
  sessionRole = null;
  try {
    await send("/auth/logout", { method: "POST" });
  } catch {
    // offline — the refresh token still expires on its own
  }
}
