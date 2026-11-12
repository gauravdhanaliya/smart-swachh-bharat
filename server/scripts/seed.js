// Seeds the configured database (MONGODB_URI / MONGODB_DB_NAME from .env):
// the verified COER University campus reference, plus — unless
// ECOSETU_SEED_DEMO=false — the clearly flagged demo buildings, dustbins,
// public toilets, facility requests and demo-login users.
//
//   npm run seed
//
// Safe to run any number of times: records are inserted only if missing and
// existing ones (including ones an official has edited) are never changed.

import { seedAll } from "../src/seed.js";
import { withRepo } from "./_shared.js";

await withRepo(async (repo, config) => {
  const { inserted } = await seedAll(repo, { demo: config.seedDemoData });
  console.log(`Seeded database "${config.mongoDbName}"${config.seedDemoData ? " (with demo data)" : " (no demo data)"}:`);
  for (const [name, n] of Object.entries(inserted)) console.log(`  ${name}: ${n} inserted`);
  console.log("Existing records were left as they were.");
});
