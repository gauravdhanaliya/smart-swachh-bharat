// Builds the API on the first request and reuses it afterwards.
//
// On Vercel the whole Express app runs as one function. A cold start loads
// this module; the first request then connects to MongoDB, applies the
// collection validators and migrations, and creates the app. Every later
// request handled by the same warm instance reuses that app and its
// connection pool, so the cost is paid once per instance, not per request.
//
// If start-up fails (bad env vars, Atlas unreachable) the request gets a clean
// 503, the cause goes to the function log only, and the next request tries
// again rather than the instance staying broken.

import crypto from "node:crypto";
import express from "express";

/** Returns an Express app (what Vercel expects as the default export) that forwards to build()'s app. */
export function lazyApp(build) {
  let ready = null;
  const outer = express();
  outer.disable("x-powered-by");
  outer.use(async function handler(req, res) {
    ready ??= build().catch((err) => {
      ready = null;
      throw err;
    });
    let app;
    try {
      app = await ready;
    } catch (err) {
      const ref = crypto.randomBytes(4).toString("hex");
      console.error(`[startup ${ref}]`, err?.message ?? err);
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: `The service is not available right now (ref ${ref}). Please try again shortly.` }));
      return;
    }
    return app(req, res);
  });
  return outer;
}
