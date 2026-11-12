// On Vercel the API runs as one function that may be started cold at any
// time. lazyApp() builds the real app (config, database connection, seed) on
// the first request and reuses it for every later one in the same instance.

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { lazyApp } from "../src/serverless.js";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }));
  });
}

test("builds the app once and reuses it across requests", async () => {
  let builds = 0;
  const inner = express().get("/api/health", (_req, res) => res.json({ ok: true, build: builds }));
  const app = lazyApp(async () => {
    builds += 1;
    await new Promise((r) => setTimeout(r, 20));
    return inner;
  });
  const s = await listen(app);
  try {
    const results = await Promise.all([1, 2, 3].map(() => fetch(`${s.base}/api/health`).then((r) => r.json())));
    assert.deepEqual(results, [{ ok: true, build: 1 }, { ok: true, build: 1 }, { ok: true, build: 1 }], "parallel first requests share one build");
    await fetch(`${s.base}/api/health`);
    assert.equal(builds, 1);
  } finally {
    await s.close();
  }
});

test("a failed start-up answers 503 with a clean message and is retried on the next request", async () => {
  let attempts = 0;
  const inner = express().get("/api/health", (_req, res) => res.json({ ok: true }));
  const app = lazyApp(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("MONGODB_URI is not set. secret-looking-detail");
    return inner;
  });
  const s = await listen(app);
  try {
    const first = await fetch(`${s.base}/api/health`);
    assert.equal(first.status, 503);
    const body = await first.json();
    assert.match(body.error, /not available/i);
    assert.ok(!JSON.stringify(body).includes("secret-looking-detail"), "start-up errors are logged, not returned");
    const second = await fetch(`${s.base}/api/health`);
    assert.equal(second.status, 200);
    assert.equal(attempts, 2);
  } finally {
    await s.close();
  }
});
