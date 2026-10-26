import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { idToken, startTestServer, TEST_ENV } from "./helpers.js";

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.stop());

// Runs an admin script the way `npm run` does, against the test database.
const run = (script, args = [], env = {}) => {
  const r = spawnSync(process.execPath, [`server/scripts/${script}.js`, ...args], {
    env: { ...process.env, ...TEST_ENV, MONGODB_URI: t.config.mongoUri, MONGODB_DB_NAME: "ecosetu_test", ...env },
    encoding: "utf8",
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

const signIn = async (uid, phone) => {
  const res = await fetch(`${t.base}/api/auth/firebase-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await idToken({ uid, phone }) }),
  });
  return (await res.json()).user;
};

test("grant-role: pending for someone who hasn't signed in, then applied at first sign-in", async () => {
  const r = run("grant-role", ["+91 90000 55501", "government"]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /pending/);
  assert.ok(!r.out.includes("9000055501"), "the full phone number is never printed");
  assert.match(r.out, /90••••••01/);
  const user = await signIn("gr-1", "+919000055501");
  assert.equal(user.role, "official");
});

test("grant-role: updates an existing user, is repeatable, and links a worker id", async () => {
  await signIn("gr-2", "+919000055502");
  const r = run("grant-role", ["9000055502", "worker", "--worker-id", "w2"]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /updated/);
  assert.deepEqual(
    [(await t.repo.getUserByUid("gr-2")).role, (await t.repo.getUserByUid("gr-2")).workerId],
    ["worker", "w2"]
  );
  assert.equal(run("grant-role", ["9000055502", "worker", "--worker-id", "w2"]).status, 0);
  assert.equal(run("grant-role", ["9000055502", "citizen"]).status, 0);
  assert.equal((await t.repo.getUserByUid("gr-2")).role, "citizen");
});

test("grant-role: rejects bad input with usage help", () => {
  assert.equal(run("grant-role", ["12345", "worker"]).status, 1);
  assert.equal(run("grant-role", ["9000055503", "emperor"]).status, 1);
  assert.equal(run("grant-role", ["9000055503", "worker", "--worker-id", "../x"]).status, 1);
  assert.match(run("grant-role", []).out, /Usage/);
});

test("seed-demo-roles: reads the three numbers from the environment, hardcodes none", async () => {
  const none = run("seed-demo-roles", [], { DEMO_CITIZEN_PHONE: "", DEMO_WORKER_PHONE: "", DEMO_GOVERNMENT_PHONE: "" });
  assert.equal(none.status, 1);
  assert.match(none.out, /DEMO_CITIZEN_PHONE/);

  const env = { DEMO_CITIZEN_PHONE: "9000066601", DEMO_WORKER_PHONE: "9000066602", DEMO_GOVERNMENT_PHONE: "9000066603" };
  const r = run("seed-demo-roles", [], env);
  assert.equal(r.status, 0, r.out);
  assert.ok(!/900006660\d/.test(r.out), "no full phone number in the output");

  assert.equal((await signIn("demo-c", "+919000066601")).role, "citizen");
  const worker = await signIn("demo-w", "+919000066602");
  assert.equal(worker.role, "worker");
  assert.equal(worker.wid, "w1");
  assert.equal((await signIn("demo-g", "+919000066603")).role, "official");
  assert.equal(run("seed-demo-roles", [], env).status, 0, "re-running is harmless");
});

test("seed-demo-roles: arguments win, and the three numbers must differ", () => {
  const r = run("seed-demo-roles", ["9000077701", "9000077702", "9000077703"], { DEMO_CITIZEN_PHONE: "", DEMO_WORKER_PHONE: "", DEMO_GOVERNMENT_PHONE: "" });
  assert.equal(r.status, 0, r.out);
  assert.equal(run("seed-demo-roles", ["9000077701", "9000077701", "9000077703"]).status, 1);
});
