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
    area: "Gomti Nagar",
    status: "Available",
    phone: "+91 98XXXXXX01",
  },
  {
    id: "w2",
    displayId: "W002",
    name: "Ramesh Kumar",
    role: "Sanitation Worker",
    area: "Hazratganj",
    status: "On Duty",
    phone: "+91 98XXXXXX02",
  },
  {
    id: "w3",
    displayId: "W003",
    name: "Suresh Yadav",
    role: "Sanitation Worker",
    area: "Aliganj",
    status: "Available",
    phone: "+91 98XXXXXX03",
  },
  {
    id: "w4",
    displayId: "W004",
    name: "Mohit Singh",
    role: "Sanitation Worker",
    area: "Indira Nagar",
    status: "On Duty",
    phone: "+91 98XXXXXX04",
  },
];

export function getWorkerById(id) {
  return WORKERS.find((w) => w.id === id) ?? null;
}
