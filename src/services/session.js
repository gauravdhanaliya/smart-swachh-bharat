// The signed-in session when the app talks to the EcoSetu API (VITE_USE_API).
//
//   - The access token lives in this module's memory only. It is never written
//     to localStorage or sessionStorage. A page reload starts with no token and
//     calls /api/auth/refresh, whose httpOnly cookie the browser holds.
//   - request() attaches "Authorization: Bearer". On a 401 it refreshes once
//     and retries the request once.
//
// The server treats a refresh token presented twice as stolen and signs the
// user out everywhere. So there must never be two refreshes in flight with the
// same cookie. Three places could cause that, and each is handled here:
//   a. Several requests in one tab get a 401 together: they share ONE refresh
//      promise (single-flight).
//   b. React StrictMode runs the page-load effect twice in development:
//      restore() is memoised, so the second call gets the first call's promise.
//   c. Several tabs: navigator.locks lets only one tab refresh at a time. The
//      winner posts its new session on a BroadcastChannel, and a tab that was
//      waiting for the lock adopts that session instead of refreshing again.
//      Without navigator.locks, tabs claim the refresh on the BroadcastChannel
//      and the lowest claim does it while the others wait for its result.
//
// Sharing the access token between this site's own tabs over BroadcastChannel
// exposes nothing new: any script on this origin could call /refresh itself.
//
// A failed refresh (401/403) clears the token and reports `reason: "expired"`,
// so the app can send the user to the login page with a message. A network
// failure is not a sign-out: the request fails and the session stays.

const LOCK_NAME = "ecosetu-auth-refresh";
const CHANNEL_NAME = "ecosetu-auth";
// "This browser had a session", so a session that can't be restored on page
// load is reported as expired rather than silently showing the login page.
// Holds only "1": no token, no user data.
const HINT_KEY = "ssb_session_hint_v1";

export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again.";
const NETWORK_MESSAGE = "Network problem. Check your internet connection and try again.";

export class ApiError extends Error {
  constructor(message, { status = 0, fields = null, existingId = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
    this.existingId = existingId; // 409 on a duplicate report: the open one
  }
}

export class SessionExpiredError extends ApiError {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE, { status: 401 });
    this.name = "SessionExpiredError";
  }
}

const hint = {
  set() {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // storage blocked: only the expiry message is lost
    }
  },
  clear() {
    try {
      localStorage.removeItem(HINT_KEY);
    } catch {
      // nothing to clear
    }
  },
  has() {
    try {
      return localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return false;
    }
  },
};

function networkError(cause) {
  const err = new ApiError(NETWORK_MESSAGE, { status: 0 });
  err.cause = cause;
  return err;
}

async function apiErrorFrom(res) {
  const data = await res.json().catch(() => ({}));
  return new ApiError(data?.error ?? `Request failed (${res.status}).`, {
    status: res.status,
    fields: data?.fields ?? null,
    existingId: typeof data?.existingId === "string" ? data.existingId : null,
  });
}

const defaultLocks = () => (typeof navigator !== "undefined" && navigator.locks?.request ? navigator.locks : null);
const defaultChannel = (name) => (typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null);

export function createSessionClient({
  fetch: fetchImpl = (...args) => globalThis.fetch(...args),
  locks = defaultLocks(),
  createChannel = defaultChannel,
  baseUrl = "",
  claimWindowMs = 60,
  peerWaitMs = 4000,
  now = Date.now,
} = {}) {
  const tabId = `${now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let accessToken = null;
  let user = null;
  // When the session this tab holds was issued (login, refresh, or another
  // tab's announcement). Refreshes are serialised, so a later one is newer.
  let sessionAt = -1;
  let inflight = null; // (a) the one refresh this tab has in flight
  let bootstrap = null; // (b) the page-load restore
  let lastShared = null; // newest session another tab announced: { session, at }
  let lastFailureAt = -1; // when another tab's refresh was refused
  let peerRefreshing = false; // another tab has a refresh in flight
  const claims = new Map(); // fallback (no locks): tabId -> { nonce, at }
  // Conditional requests: path -> { etag, body } of the last full answer.
  // Memory only, and cleared whenever the signed-in user changes.
  const conditionalCache = new Map();
  let authConfig = null; // Promise of GET /api/auth/config
  const waiters = new Set();
  const listeners = new Set();
  const channel = createChannel ? createChannel(CHANNEL_NAME) : null;

  const emit = (reason) => {
    for (const fn of listeners) {
      try {
        fn({ user, reason });
      } catch {
        // a misbehaving listener must not break the session
      }
    }
  };
  const post = (msg) => {
    try {
      channel?.postMessage({ ...msg, from: tabId });
    } catch {
      // channel closed
    }
  };

  function setSession(session, reason, at = now()) {
    if (user?.uid !== session.user?.uid) conditionalCache.clear();
    accessToken = session.accessToken;
    user = session.user;
    sessionAt = at;
    hint.set();
    emit(reason);
    return session;
  }

  function clear() {
    conditionalCache.clear();
    accessToken = null;
    user = null;
    sessionAt = -1;
    hint.clear();
  }

  // The refresh cookie was refused: sign out here, and say so if there was a session.
  function expire() {
    const hadSession = accessToken !== null || user !== null || hint.has();
    clear();
    if (hadSession) emit("expired");
  }

  // ---- messages from the other tabs ---------------------------------------
  const RESULT_TYPES = new Set(["refreshed", "refresh-failed", "refresh-aborted"]);
  function onMessage({ data: msg }) {
    if (!msg || msg.from === tabId) return;
    switch (msg.type) {
      case "claim":
        claims.set(msg.from, { nonce: msg.nonce, at: msg.at });
        break;
      case "refreshing":
        peerRefreshing = true;
        break;
      case "refreshed":
        peerRefreshing = false;
        claims.delete(msg.from);
        // Messages between tabs can arrive late, even after this tab has
        // refreshed again itself: never swap a newer session for an older one.
        if (!lastShared || msg.at >= lastShared.at) lastShared = { session: msg.session, at: msg.at };
        if (msg.at >= sessionAt) setSession(msg.session, "sync", msg.at);
        break;
      case "refresh-failed":
        peerRefreshing = false;
        claims.delete(msg.from);
        lastFailureAt = msg.at;
        if (accessToken !== null || user !== null) expire();
        break;
      case "refresh-aborted":
        peerRefreshing = false;
        claims.delete(msg.from);
        break;
      case "logout":
        lastShared = null;
        bootstrap = null;
        if (accessToken !== null || user !== null) {
          clear();
          emit("logout");
        }
        break;
      default:
        break;
    }
    // A waiter removes itself while being called; deleting the current entry is safe in Set iteration.
    if (RESULT_TYPES.has(msg.type)) for (const fn of waiters) fn(msg);
  }
  if (channel) {
    if (typeof channel.addEventListener === "function") channel.addEventListener("message", onMessage);
    else channel.onmessage = onMessage;
  }

  /** Resolves with the next refresh result another tab announces, or undefined after `ms`. */
  function waitForPeer(ms) {
    return new Promise((resolve) => {
      const done = (value) => {
        clearTimeout(timer);
        waiters.delete(onResult);
        resolve(value);
      };
      const onResult = (msg) => done(msg);
      const timer = setTimeout(() => done(undefined), ms);
      waiters.add(onResult);
    });
  }
  const resultOf = (msg) => (msg?.type === "refreshed" ? msg.session : msg?.type === "refresh-failed" ? null : undefined);

  // ---- the refresh itself --------------------------------------------------
  async function networkRefresh() {
    post({ type: "refreshing", at: now() });
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "X-EcoSetu-Client": "web" },
        credentials: "same-origin",
      });
    } catch (err) {
      post({ type: "refresh-aborted", at: now() });
      throw networkError(err);
    }
    if (res.ok) {
      const session = await res.json();
      const at = now();
      setSession(session, "refresh", at);
      post({ type: "refreshed", session, at });
      return session;
    }
    if (res.status === 401 || res.status === 403) {
      post({ type: "refresh-failed", at: now() });
      expire();
      return null;
    }
    post({ type: "refresh-aborted", at: now() });
    throw await apiErrorFrom(res);
  }

  async function coordinatedRefresh() {
    const startedAt = now();
    // Another tab finished a refresh after this one was needed: use its result.
    const settledByPeer = () => {
      if (lastShared && lastShared.at >= startedAt) return { done: true, value: lastShared.session };
      if (lastFailureAt >= startedAt) return { done: true, value: null };
      return { done: false };
    };
    const run = async () => {
      if (peerRefreshing) await waitForPeer(peerWaitMs);
      const settled = settledByPeer();
      return settled.done ? settled.value : networkRefresh();
    };

    if (locks) return locks.request(LOCK_NAME, run); // (c) one tab at a time

    if (channel) {
      // (c, fallback) claim the refresh; the lowest claim in the window does it.
      const nonce = Math.random();
      post({ type: "claim", nonce, at: now() });
      await new Promise((r) => setTimeout(r, claimWindowMs));
      const rivals = [...claims.values()].filter((c) => c.at >= startedAt - claimWindowMs);
      if (rivals.some((c) => c.nonce < nonce)) {
        const value = resultOf(await waitForPeer(peerWaitMs));
        if (value !== undefined) return value;
        const settled = settledByPeer();
        if (settled.done) return settled.value;
      }
      return run();
    }
    return run();
  }

  /** (a) Every caller in this tab shares one refresh. Resolves to the session, or null if signed out. */
  function refresh() {
    inflight ??= coordinatedRefresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  /**
   * (b) Page load: get a session from the refresh cookie, once. With no
   * "was signed in" hint (a first visit, or after signing out) there is no
   * cookie to use, so no request is made at all.
   */
  function restore() {
    if (accessToken) return Promise.resolve({ accessToken, user });
    if (!hint.has()) return Promise.resolve(null);
    bootstrap ??= refresh().catch((err) => {
      bootstrap = null;
      throw err;
    });
    return bootstrap;
  }

  // ---- requests --------------------------------------------------------------
  function send(path, { method = "GET", body, headers = {} } = {}, token = accessToken) {
    return fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    }).catch((err) => {
      throw networkError(err);
    });
  }

  /**
   * Calls the API as the signed-in user. Rejects with ApiError, or
   * SessionExpiredError if signed out. With `conditional: true` (polled
   * lists) the last ETag for this path is sent as If-None-Match, and a 304
   * resolves with the very same object as last time — nothing re-downloaded.
   */
  async function request(path, { conditional = false, ...options } = {}) {
    const cached = conditional ? conditionalCache.get(path) : null;
    const headers = cached ? { ...options.headers, "If-None-Match": cached.etag } : options.headers;
    const res = await authorised(path, { ...options, headers }, { allowNotModified: Boolean(cached) });
    if (res.status === 304) return cached.body;
    if (res.status === 204) return null;
    const body = await res.json();
    const etag = conditional ? res.headers?.get?.("ETag") : null;
    if (etag) conditionalCache.set(path, { etag, body });
    return body;
  }

  /** Like request(), for a binary response (a photo): resolves with a Blob. */
  async function requestBlob(path) {
    const res = await authorised(path, {});
    return res.blob();
  }

  // Sends with the access token; on a 401 refreshes once (shared) and retries once.
  async function authorised(path, options, { allowNotModified = false } = {}) {
    let res = await send(path, options);
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      const session = await refresh();
      if (!session) throw new SessionExpiredError();
      res = await send(path, options);
      if (res.status === 401) {
        expire();
        throw new SessionExpiredError();
      }
    }
    if (res.status === 304 && allowNotModified) return res;
    if (!res.ok) throw await apiErrorFrom(res);
    return res;
  }

  async function login(path, body) {
    const res = await send(path, { method: "POST", body }, null);
    if (!res.ok) throw await apiErrorFrom(res);
    const session = await res.json();
    bootstrap = null;
    const at = now();
    setSession(session, "login", at);
    post({ type: "refreshed", session, at }); // other tabs follow
    return session;
  }

  return {
    getAccessToken: () => accessToken,
    getUser: () => user,
    request,
    requestBlob,
    refresh,
    restore,
    /**
     * The server's public login settings: { demoLoginEnabled }. Asked once per
     * client; a failed request isn't remembered, so the next call retries.
     */
    getAuthConfig() {
      authConfig ??= send("/api/auth/config", {}, null)
        .then(async (res) => {
          if (!res.ok) throw await apiErrorFrom(res);
          const body = await res.json();
          return { demoLoginEnabled: body?.demoLoginEnabled === true };
        })
        .catch((err) => {
          authConfig = null;
          throw err;
        });
      return authConfig;
    },
    /** The labelled demo login: the only thing sent is which demo user. */
    loginDemo: (role) => login("/api/auth/demo", { role }),
    /** Phone login: the Firebase ID token proves the number; the server decides the role. */
    loginFirebase: (idToken) => login("/api/auth/firebase", { idToken }),
    async logout() {
      try {
        await send("/api/auth/logout", { method: "POST", headers: { "X-EcoSetu-Client": "web" } }, null);
      } catch {
        // offline: the local session is cleared regardless
      }
      bootstrap = null;
      lastShared = null;
      const had = accessToken !== null || user !== null;
      clear();
      if (had) emit("logout");
      post({ type: "logout", at: now() });
    },
    /** listener({ user, reason }) on every change. Returns an unsubscribe function. */
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
      waiters.clear();
      try {
        channel?.close();
      } catch {
        // already closed
      }
    },
  };
}

// ---- the app's one client --------------------------------------------------

let shared = null;

export function getSessionClient() {
  shared ??= createSessionClient();
  return shared;
}

/** Tests only: drop the shared client so the next test starts signed out. */
export function resetSessionClientForTests(options) {
  shared?.dispose();
  shared = options ? createSessionClient(options) : null;
  return shared;
}
