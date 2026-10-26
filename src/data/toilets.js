// Public-toilet constants shared by the screens. The toilets themselves come
// from the EcoSetu API (GET /api/locations?type=public_toilet) — see
// services/facilityService.js. Simulated demo toilets are seeded on the
// server (server/src/seed-data.js) and are flagged isDemo.

export const TOILET_STATUS = {
  OPEN: "Open",
  CLOSED: "Closed",
  MAINTENANCE: "Maintenance",
};
