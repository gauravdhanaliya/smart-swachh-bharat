// A stand-in for the EcoSetu API's auth routes, with the same rules as the
// real server (server/src/app.js, db.js):
//   - each refresh token works once; presenting a used one revokes every
//     refresh token AND access token of that user (reuse = theft)
//   - the browser's cookie jar is shared by every tab, and a request carries
//     the cookie that was in the jar when it was SENT
// Every response is delayed a little, so concurrent requests really overlap.
// That is what makes a careless client sign itself out, as it would for real.

// ---- simulated time ---------------------------------------------------------
// Every simulated delay (server latency, a message between tabs) goes through
// this one queue, which settles them strictly in due-time order (ties in the
// order they were scheduled), one per macrotask so each one's follow-up work
// runs before the next. Plain setTimeout can't promise that: Node runs every
// expired timer of one duration before any of another (all expired 15 ms
// server responses before an expired 2 ms message), and Windows rounds timers
// up to ~15.6 ms ticks, so a message due 13 ms before a response could arrive
// after it. Real tabs never reorder like that; tests that need messages to be
// late make them late on purpose (createChannelBus({ delayMs })).
const queue = [];
let queueSeq = 0;
let armed = null; // { timer } waiting for the head's due time, or { immediate } about to pump

function pump() {
  armed = null;
  if (!queue.length) return;
  if (queue[0].due > performance.now()) return arm();
  queue.shift().resolve();
  armed = { immediate: setImmediate(pump) }; // after the resolved work's microtasks
}

function arm() {
  if (armed || !queue.length) return;
  const wait = queue[0].due - performance.now();
  armed = wait > 0 ? { timer: setTimeout(pump, wait) } : { immediate: setImmediate(pump) };
}

/** Resolves after `ms` of simulated latency, in due-time order with every other simulated delay. */
export function later(ms) {
  return new Promise((resolve) => {
    const item = { due: performance.now() + ms, seq: queueSeq++, resolve };
    let i = queue.length;
    while (i > 0 && (queue[i - 1].due > item.due || (queue[i - 1].due === item.due && queue[i - 1].seq > item.seq))) i -= 1;
    queue.splice(i, 0, item);
    // A new earliest item: a timer set for the old head would fire too late.
    if (i === 0 && armed?.timer) {
      clearTimeout(armed.timer);
      armed = null;
    }
    arm();
  });
}

const DEMO = {
  citizen: "demo-citizen",
  worker: "demo-worker",
  official: "demo-official",
  government: "demo-official",
};

export function createFakeAuthServer({ latencyMs = 5, demoLoginEnabled = true } = {}) {
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
  // What actually signs a user out everywhere: a refresh token presented twice.
  // That can only happen if two refreshes are in flight at once.
  let refreshesInFlight = 0;
  let maxConcurrentRefreshes = 0;
  let reuseDetected = false;

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
    const isRefresh = method === "POST" && path === "/api/auth/refresh";
    if (isRefresh) {
      refreshesInFlight += 1;
      maxConcurrentRefreshes = Math.max(maxConcurrentRefreshes, refreshesInFlight);
    }
    try {
      await later(latencyMs);
      return respond({ method, path, headers, body, cookie });
    } finally {
      if (isRefresh) refreshesInFlight -= 1;
    }
  }

  function respond({ method, path, headers, body, cookie }) {

    const bearer = /^Bearer (.+)$/.exec(headers.authorization ?? "")?.[1];
    if (method === "POST" && path === "/api/auth/refresh") {
      if (headers["x-ecosetu-client"] !== "web") return json(403, { error: "Request not allowed." });
      const t = cookie && refreshTokens.get(cookie);
      if (!t) {
        jar.cookie = null;
        return json(401, { error: "Session expired. Please sign in again." });
      }
      if (t.used) {
        reuseDetected = true;
        revokeAll(t.uid);
        jar.cookie = null;
        return json(401, { error: "Session expired. Please sign in again." });
      }
      t.used = true;
      return json(200, issue(t.uid));
    }
    if (method === "GET" && path === "/api/auth/config") return json(200, { demoLoginEnabled });
    if (method === "POST" && path === "/api/auth/demo") {
      if (!demoLoginEnabled) return json(404, { error: "Not found." });
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
    /** Most /api/auth/refresh calls ever in flight at once (more than 1 risks a reused cookie). */
    maxConcurrentRefreshes: () => maxConcurrentRefreshes,
    /** True once a used refresh token was presented (the server then signs the user out everywhere). */
    reuseDetected: () => reuseDetected,
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
          later(delayMs).then(() => other._deliver(copy));
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
