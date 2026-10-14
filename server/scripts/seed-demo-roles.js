// Assigns roles to your three Firebase test phone numbers, so each role can be
// tried end to end.
//
//   npm run seed-demo-roles                              # numbers from .env
//   npm run seed-demo-roles -- <citizen> <worker> <government>
//
// .env keys (used when no arguments are given): DEMO_CITIZEN_PHONE,
// DEMO_WORKER_PHONE, DEMO_GOVERNMENT_PHONE. Nothing is hardcoded. The worker
// is linked to demo worker "w1". Safe to re-run.

import { describeResult, maskPhone, normalisePhone, withRepo } from "./_shared.js";

const [aCitizen, aWorker, aGovernment] = process.argv.slice(2);
const entries = [
  { label: "citizen", role: "citizen", env: "DEMO_CITIZEN_PHONE", given: aCitizen },
  { label: "worker", role: "worker", env: "DEMO_WORKER_PHONE", given: aWorker, workerId: "w1" },
  { label: "government", role: "official", env: "DEMO_GOVERNMENT_PHONE", given: aGovernment },
].map((e) => ({ ...e, phone: normalisePhone(e.given ?? process.env[e.env]) }));

const bad = entries.filter((e) => !e.phone);
if (bad.length) {
  console.error(
    `Missing or invalid phone number for: ${bad.map((e) => e.label).join(", ")}.\n` +
      `Pass them as arguments (citizen worker government) or set ${bad.map((e) => e.env).join(", ")} in .env.`
  );
  process.exit(1);
}
if (new Set(entries.map((e) => e.phone)).size !== entries.length) {
  console.error("The three phone numbers must be different.");
  process.exit(1);
}

await withRepo(async (repo) => {
  for (const e of entries) {
    const { status } = await repo.grantRole({ phone: e.phone, role: e.role, workerId: e.workerId ?? null });
    console.log(`${e.label.padEnd(10)} ${maskPhone(e.phone)} → ${e.role}: ${describeResult(status)}.`);
  }
});
