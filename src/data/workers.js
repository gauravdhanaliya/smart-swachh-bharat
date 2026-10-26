// Demo sanitation-worker directory for the Government dashboard (Step 5).
// `id` stays compatible with the ids already used on complaint objects
// (assignedWorkerId) from Step 3, so assignment history lines up with
// the richer profile shown on the Government "Workers" screen.
// Shape mirrors what a future `GET /api/workers` response would return.

export const WORKERS = [
  {
    id: "w1",
    displayId: "W001",
    name: "Vikash Kumar",
    role: "Sanitation Worker",
    area: "Roorkee City & Railway Station",
    status: "Available",
    phone: "+91 98XXXXXX01",
  },
  {
    id: "w2",
    displayId: "W002",
    name: "Ramesh Kumar",
    role: "Sanitation Worker",
    area: "COER University & Haridwar Road",
    status: "On Duty",
    phone: "+91 98XXXXXX02",
  },
];

export function getWorkerById(id) {
  return WORKERS.find((w) => w.id === id) ?? null;
}
