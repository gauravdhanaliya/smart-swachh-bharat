// A stand-in for the EcoSetu API's auth routes, with the same rules as the
// real server (server/src/app.js, db.js):
//   - each refresh token works once; presenting a used one revokes every
//     refresh token AND access token of that user (reuse = theft)
//   - the browser's cookie jar is shared by every tab, and a request carries
//     the cookie that was in the jar when it was SENT
// Every response is delayed a little, so concurrent requests really overlap.
// That is what makes a careless client sign itself out, as it would for real.

const DEMO = {
  citizen: "demo-citizen",
  worker: "demo-worker",
  official: "demo-official",
  government: "demo-official",
};

export function createFakeAuthServer({ latencyMs = 5 } = {}) {
  const users = {
    "demo-citizen": { uid: "demo-citizen", role: "citizen", name: "Demo Citizen", phone: null, isDemo: true },
    "demo-worker": { uid: "demo-worker", role: "worker", name: "Vikash Kumar", phone: null, isDemo: true, wid: "w1" },
    "demo-official": { uid: "demo-official", role: "official", name: "Demo Official", phone: null, isDemo: true },
    "fb-user": { uid: "fb-user", role: "citizen", name: "citizen", phone: "+91 98XXXXXX10", isDemo: false },
  };
  const refreshTokens = new Map(); // token -> { uid, used }
  const accessTokens = new Map(); // token -> uid
  const jar = { cookie: null }; // one browser, shared by all its tabs
  const calls = [];
  let seq = 0;
  let offline = false;

  const json = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

  function issue(uid) {
    seq += 1;
    const refresh = `rt-${seq}`;
    const access = `at-${seq}`;
    refreshTokens.set(refresh, { uid, used: false });
    accessTokens.set(access, uid);
    jar.cookie = refresh;
    return { accessToken: access, expiresIn: 900, user: users[uid] };
  }

  function revokeAll(uid) {
    for (const t of refreshTokens.values()) if (t.uid === uid) t.used = true;
    for (const [t, owner] of accessTokens) if (owner === uid) accessTokens.delete(t);
  }

  async function fetchImpl(url, init = {}) {
    const path = new URL(url, "http://app.test").pathname;
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : undefined;
    const cookie = jar.cookie; // attached when the request leaves the browser
    calls.push({ method, path, body, headers });
    if (offline) throw new TypeError("Failed to fetch");
    await new Promise((r) => setTimeout(r, latencyMs));

    const bearer = /^Bearer (.+)$/.exec(headers.authorization ?? "")?.[1];
    if (method === "POST" && path === "/api/auth/refresh") {
      if (headers["x-ecosetu-client"] !== "web") return json(403, { error: "Request not allowed." });
      const t = cookie && refreshTokens.get(cookie);
      if (!t) {
        jar.cookie = null;
        return json(401, { error: "Session expired. Please sign in again." });
      }
      if (t.used) {
        revokeAll(t.uid);
        jar.cookie = null;
        return json(401, { error: "Session expired. Please sign in again." });
      }
      t.used = true;
      return json(200, issue(t.uid));
    }
    if (method === "POST" && path === "/api/auth/demo") {
      const uid = DEMO[body?.role];
      if (!uid || Object.keys(body).length !== 1) return json(400, { error: "Please fix the highlighted fields." });
      return json(200, issue(uid));
    }
    if (method === "POST" && path === "/api/auth/firebase") {
      if (body?.idToken !== "good-firebase-id-token") return json(401, { error: "Phone verification failed. Please sign in again." });
      return json(200, issue("fb-user"));
    }
    if (method === "POST" && path === "/api/auth/logout") {
      const t = cookie && refreshTokens.get(cookie);
      if (t) t.used = true;
      jar.cookie = null;
      return json(200, { ok: true });
    }
    if (method === "GET" && (path === "/api/auth/me" || path === "/api/data")) {
      const uid = bearer && accessTokens.get(bearer);
      if (!uid) return json(401, { error: "Sign in required." });
      return json(200, path === "/api/data" ? { ok: true, uid } : { user: users[uid] });
    }
    // Consent (Feature 5): these tests aren't about it, so every account has agreed.
    if (method === "GET" && path === "/api/me/consent") {
      const uid = bearer && accessTokens.get(bearer);
      if (!uid) return json(401, { error: "Sign in required." });
      const consent = { version: 1, acceptedAt: "2026-11-01T00:00:00.000Z", items: {} };
      return json(200, { version: 1, consent, upToDate: true });
    }
    return json(404, { error: "Not found." });
  }

  return {
    fetch: fetchImpl,
    jar,
    calls,
    count: (path) => calls.filter((c) => c.path === path).length,
    /** A session from an earlier visit: a valid refresh cookie in the jar, nothing in memory. */
    signInEarlier(uid = "demo-citizen") {
      issue(uid);
    },
    /** Every access token stops working (15 minutes have passed). */
    expireAccessTokens() {
      accessTokens.clear();
    },
    /** The user's refresh tokens are revoked elsewhere (e.g. theft detected). */
    revokeEverything() {
      for (const t of refreshTokens.values()) t.used = true;
      accessTokens.clear();
    },
    /** True if the browser still holds a refresh cookie the server would accept. */
    hasLiveSession: () => Boolean(jar.cookie && refreshTokens.get(jar.cookie) && !refreshTokens.get(jar.cookie).used),
    setOffline(value) {
      offline = value;
    },
  };
}

/** navigator.locks stand-in: one holder per lock name, granted in request order. */
export function createLockManager() {
  const tails = new Map();
  return {
    request(name, callback) {
      const prev = tails.get(name) ?? Promise.resolve();
      const run = prev.then(() => callback({ name }));
      tails.set(name, run.catch(() => {}));
      return run;
    },
  };
}

/**
 * BroadcastChannel stand-in: delivers to every OTHER channel with the same
 * name, after `delayMs`. Real tabs are separate processes, so a message is
 * never there instantly; with zero delay a race between two tabs could be
 * hidden by one tab hearing the other "in time".
 */
export function createChannelBus({ delayMs = 2 } = {}) {
  const channels = new Set();
  return function createChannel(name) {
    const listeners = new Set();
    const channel = {
      name,
      onmessage: null,
      postMessage(data) {
        const copy = structuredClone(data);
        for (const other of channels) {
          if (other === channel || other.name !== name) continue;
          setTimeout(() => other._deliver(copy), delayMs);
        }
      },
      addEventListener(type, fn) {
        if (type === "message") listeners.add(fn);
      },
      removeEventListener(type, fn) {
        listeners.delete(fn);
      },
      close() {
        channels.delete(channel);
      },
      _deliver(data) {
        const event = { data };
        channel.onmessage?.(event);
        for (const fn of listeners) fn(event);
      },
    };
    channels.add(channel);
    return channel;
  };
}
