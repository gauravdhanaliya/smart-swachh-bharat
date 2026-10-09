import { CAMPUS, DEMO_BUILDINGS, DEMO_REQUESTS } from "./seed-data.js";

/**
 * Seeds an empty database. Always inserts the verified campus reference;
 * demo buildings and requests only when `demo` is true. Safe to
 * call on every start — it does nothing once locations exist.
 */
export function seedIfEmpty(repo, { demo = true } = {}) {
  if (repo.countLocations() > 0) return { seeded: false };

  repo.transaction(() => {
    repo.insertLocation({ ...CAMPUS, createdBy: "system" });
    if (!demo) return;

    DEMO_BUILDINGS.forEach((loc) =>
      repo.insertLocation({ ...loc, createdBy: "system" })
    );

    for (const r of DEMO_REQUESTS) {
      repo.insertRequest({
        ...r,
        requestedByUser: "demo-seed",
        reviewedBy: r.status === "PENDING" ? null : "system",
        isDemo: true,
        updatedAt: r.createdAt,
      });
      if (r.status === "APPROVED") {
        repo.publishRequest(
          {
            id: r.id,
            facility_type: r.facilityType,
            suggested_name: r.suggestedName,
            address: r.address,
            latitude: r.latitude,
            longitude: r.longitude,
            reason: r.reason,
            is_demo: 1,
          },
          "system"
        );
      }
    }
  });
  return { seeded: true };
}
