// The admin scripts that grant staff roles. Roles go to the email of a saved
// account (there is no phone sign-in any more), and apply only once that
// email is verified.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { idToken, runScript, startTestServer } from "./helpers.js";

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.stop());

const run = (script, args, env) => runScript(t, script, args, env);

/** Signs in a saved (email) account; returns the API's user. */
const signIn = async (uid, email, emailVerified = true) => {
  const res = await fetch(`${t.base}/api/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await idToken({ uid, provider: "password", email, emailVerified }) }),
  });
  return (await res.json()).user;
};

test("grant-role: pending for an email nobody has saved yet, then applied at its first verified sign-in", async () => {
  const r = await run("grant-role", ["Ward.Officer@Example.TEST", "government"]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /pending/);
  assert.ok(!r.out.toLowerCase().includes("ward.officer@example.test"), "the full email is never printed");
  assert.match(r.out, /wa\*\*\*@e\*\*\*\.test/);
  assert.equal((await signIn("gr-1", "ward.officer@example.test", false)).role, "citizen", "not while unverified");
  assert.equal((await signIn("gr-1", "ward.officer@example.test", true)).role, "official");
});

test("grant-role: updates an existing verified account, is repeatable, and can take the role away again", async () => {
  await signIn("gr-2", "official.two@example.test");
  const r = await run("grant-role", ["official.two@example.test", "government"]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /updated/);
  assert.equal((await t.repo.getUserByUid("gr-2")).role, "official");
  assert.equal((await run("grant-role", ["official.two@example.test", "government"])).status, 0);
  assert.equal((await run("grant-role", ["official.two@example.test", "citizen"])).status, 0);
  assert.equal((await t.repo.getUserByUid("gr-2")).role, "citizen");
});

test("grant-role: an unverified account is only pending, with a hint", async () => {
  await signIn("gr-3", "not.yet@example.test", false);
  const r = await run("grant-role", ["not.yet@example.test", "government"]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /pending/);
  assert.match(r.out, /verif/i);
  assert.equal((await t.repo.getUserByUid("gr-3")).role, "citizen");
});

test("grant-role makes officials only: workers are added by an official in the app", async () => {
  await signIn("gr-4", "would.be.worker@example.test");
  const r = await run("grant-role", ["would.be.worker@example.test", "worker"]);
  assert.equal(r.status, 1);
  assert.match(r.out, /worker directory/i);
  assert.equal((await t.repo.getUserByUid("gr-4")).role, "citizen");
  assert.equal((await run("grant-role", ["would.be.worker@example.test", "government", "--worker-id", "w1"])).status, 1, "no --worker-id any more");
});

test("grant-role: rejects bad input with usage help", async () => {
  assert.equal((await run("grant-role", ["9000055503", "government"])).status, 1, "a phone number is not accepted");
  assert.equal((await run("grant-role", ["not-an-email", "government"])).status, 1);
  assert.equal((await run("grant-role", ["a@example.test", "emperor"])).status, 1);
  assert.match((await run("grant-role", [])).out, /Usage/);
});

test("seed-demo-roles is gone (it made workers outside the directory)", async () => {
  const pkg = JSON.parse((await import("node:fs")).readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["seed-demo-roles"], undefined);
});
