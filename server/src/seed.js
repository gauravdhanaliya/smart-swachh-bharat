import { CAMPUS, DEMO_BINS, DEMO_BUILDINGS, DEMO_REQUESTS, DEMO_TOILETS, DEMO_USERS, DEMO_WORKERS } from "./seed-data.js";

/**
 * Seeds the database. Idempotent: every seed record has a fixed id and is
 * inserted only if missing, so running this twice (or on every start) never
 * duplicates anything and never overwrites a record that was edited since.
 *
 * Always: the verified campus reference. With `demo`: demo buildings, bins,
 * toilets, facility requests and the three demo-login users.
 * Returns { inserted: { locations, requests, users } }.
 */
export async function seedAll(repo, { demo = true } = {}) {
  const inserted = { locations: 0, requests: 0, users: 0 };
  const count = async (key, wasInserted) => {
    if (await wasInserted) inserted[key] += 1;
  };

  await count("locations", repo.insertLocationIfMissing({ ...CAMPUS, id: "CP-001", createdBy: "system" }));
  if (!demo) return { inserted };

  for (const loc of [...DEMO_BUILDINGS, ...DEMO_BINS, ...DEMO_TOILETS]) {
    await count("locations", repo.insertLocationIfMissing({ ...loc, createdBy: "system" }));
  }
  for (const r of DEMO_REQUESTS) {
    await count(
      "requests",
      repo.insertRequestIfMissing({
        ...r,
        requestedByUser: "demo-seed",
        reviewedBy: r.status === "PENDING" ? null : "system",
        isDemo: true,
        updatedAt: r.createdAt,
      })
    );
  }
  for (const u of DEMO_USERS) {
    await count("users", repo.insertDemoUserIfMissing(u));
  }
  for (const w of DEMO_WORKERS) await repo.insertWorkerIfMissing(w);
  return { inserted };
}

/** Same as seedAll; reports whether anything was inserted. Safe to call on every start. */
export async function seedIfEmpty(repo, options) {
  const { inserted } = await seedAll(repo, options);
  return { seeded: inserted.locations + inserted.requests + inserted.users > 0 };
}
