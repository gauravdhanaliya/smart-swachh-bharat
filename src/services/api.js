// Thin client for the EcoSetu API (server/). Same-origin `/api` by default
// (Vite proxies it to the API in development); set VITE_API_BASE_URL when
// the API is hosted elsewhere.

const BASE = (import.meta.env?.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "ssb_api_token_v1";

export class ApiError extends Error {
  constructor(message, { status = 0, fields = null } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked — the token still works for this page load via memory
  }
  memoryToken = token ?? null;
}

let memoryToken = null;

/** Role claimed by the stored token. UI hint only — the server re-checks it. */
export function getTokenRole() {
  const token = getToken() ?? memoryToken;
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export async function api(path, { method = "GET", body, signal } = {}) {
  const token = getToken() ?? memoryToken;
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the EcoSetu server. Check that it is running and try again.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status}).`, {
      status: res.status,
      fields: data?.fields ?? null,
    });
  }
  return data;
}

/** POST /api/auth/login — stores the token on success. */
export async function loginToApi({ role, mobile, accessCode, workerId, name }) {
  const data = await api("/auth/login", { method: "POST", body: { role, mobile, accessCode, workerId, name } });
  setToken(data.token);
  return data.user;
}

export function logoutFromApi() {
  setToken(null);
}
