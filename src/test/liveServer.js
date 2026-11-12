// Starts the real API (server/test/live-server.mjs) for integration tests and
// gives back a `fetch` that behaves like a browser talking to it: relative
// URLs go to the server, and the httpOnly refresh cookie is kept in a jar and
// sent back, as a browser would. Every request is recorded in `calls`.

import { spawn } from "node:child_process";
import path from "node:path";

const nodeFetch = globalThis.fetch.bind(globalThis);

export async function startLiveServer() {
  const child = spawn(process.execPath, [path.resolve("server/test/live-server.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
  const base = await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error("The test API didn't start within 90 s.")), 90_000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      const m = /READY (\S+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    child.on("exit", (code) => reject(new Error(`The test API exited early (${code}).`)));
  });

  const jar = { cookie: null };
  const calls = [];
  let offlinePrefix = null;

  async function browserFetch(url, init = {}) {
    const target = new URL(String(url), base);
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, path: target.pathname + target.search, headers: { ...(init.headers ?? {}) } });
    if (offlinePrefix && target.pathname.startsWith(offlinePrefix)) throw new TypeError("Failed to fetch");
    const headers = { ...(init.headers ?? {}) };
    if (jar.cookie) headers.cookie = jar.cookie;
    const res = await nodeFetch(target, { ...init, headers });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      if (!c.startsWith("ssb_refresh=")) continue;
      jar.cookie = /Max-Age=0/i.test(c) ? null : c.split(";")[0];
    }
    return res;
  }

  return {
    base,
    fetch: browserFetch,
    calls,
    jar,
    /** Requests whose path starts with `prefix` fail as if offline; null restores them. */
    setOffline(prefix) {
      offlinePrefix = prefix;
    },
    /** Make the server's (mock) Blob store refuse uploads, as when it is over its limit. */
    blobDown(down) {
      child.stdin.write(down ? "blob-down\n" : "blob-up\n");
      return new Promise((r) => setTimeout(r, 50));
    },
    /** Forget the browser's cookie (a different browser / signed out). */
    clearCookies() {
      jar.cookie = null;
    },
    async stop() {
      const exited = new Promise((r) => child.once("exit", r));
      child.stdin.write("stop\n");
      await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))]);
    },
  };
}
