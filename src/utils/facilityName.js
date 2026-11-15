// Seeded demo facilities carry " (DEMO)" in their stored name (server
// seed-data.js) and isDemo: true. Screens show the plain name with a small
// DEMO badge instead of the suffix.

const DEMO_SUFFIX = /\s*\(DEMO\)\s*$/i;

/** { name, demo } for display: the name without " (DEMO)", and whether to show the badge. */
export function displayFacilityName(facility) {
  const raw = String(facility?.name ?? "");
  const demo = Boolean(facility?.isDemo) || DEMO_SUFFIX.test(raw);
  return { name: raw.replace(DEMO_SUFFIX, "").trim() || raw, demo };
}
