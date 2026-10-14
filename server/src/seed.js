import { CAMPUS, DEMO_BUILDINGS, DEMO_REQUESTS } from "./seed-data.js";

/**
 * Seeds an empty database. Always inserts the verified campus reference;
 * demo buildings and requests only when `demo` is true. Safe to
 * call on every start — it does nothing once locations exist.
 */
export async function seedIfEmpty(repo, { demo = true } = {}) {
  if ((await repo.countLocations()) > 0) return { seeded: false };

  await repo.transaction(async (tx) => {
    await tx.insertLocation({ ...CAMPUS, createdBy: "system" });
    if (!demo) return;

    for (const loc of DEMO_BUILDINGS) {
      await tx.insertLocation({ ...loc, createdBy: "system" });
    }

    for (const r of DEMO_REQUESTS) {
      await tx.insertRequest({
        ...r,
        requestedByUser: "demo-seed",
        reviewedBy: r.status === "PENDING" ? null : "system",
        isDemo: true,
        updatedAt: r.createdAt,
      });
      if (r.status === "APPROVED") {
        await tx.publishRequest(
          {
            id: r.id,
            facilityType: r.facilityType,
            suggestedName: r.suggestedName,
            address: r.address,
            latitude: r.latitude,
            longitude: r.longitude,
            reason: r.reason,
            isDemo: true,
          },
          "system"
        );
      }
    }
  });
  return { seeded: true };
}
