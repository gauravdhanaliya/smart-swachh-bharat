# EcoSetu — Smart Swachh Bharat

**Connecting Citizens, Government & Sanitation Workers**

A prototype civic-tech platform for urban waste management and sanitation,
built for Smart India Hackathon (SIH). One citizen complaint travels
through a single shared data store and is visible — in real time — to
the Citizen who reported it, the Government Official who assigns it, and
the Sanitation Worker who resolves it.

> **This is a prototype.** All data (bins, toilets, complaints, workers,
> live fill-levels) is simulated and stored locally in the browser
> (`localStorage`). Nothing here connects to a real municipal system,
> SMS gateway, or payment provider. Bin and toilet coordinates are
> clearly labeled `"Demo Location"` in the data and UI — they are not
> verified official municipal locations.

## Technology stack

- **React 19** + **Vite** — UI and dev/build tooling
- **React Router v7** — client-side routing and role-based route guards
- **Tailwind CSS v4** — styling
- **Leaflet / React-Leaflet** — interactive bin & public-toilet map (free OpenStreetMap tiles, no paid API keys, no Google Maps JavaScript API/billing). The map supports zoom/pan, marker popups, category + status filters, search, "Use My Location" (browser Geolocation API, never stored or sent anywhere), and a "Navigate" link that opens Google Maps directions by URL — no Maps API key needed for that either.
- **localStorage** — the prototype's single source of truth for complaints, auth/role state, and the demo worker session (swap-ready: only `src/services/complaintService.js` would need to change for a real backend)

No AI, Redis, message queues, real SMS/push, or payment integrations are used — by design, to keep the prototype lightweight and easy to run anywhere.

## Documentation

- `README.md` — this file: setup, stack, demo roles, deployment
- `SIH_DEMO_GUIDE.md` — full judge-facing demo script, talking points, and architecture explainer
- `SIH_JUDGE_QA.md` — prepared answers to likely judge questions
- `SIH_DEMO_CHECKLIST.md` — a plain step-by-step checklist version of the demo flow


## Installation

Requires Node.js 18+.

```bash
npm install
```

## Run commands

```bash
npm run dev       # start the local dev server (Vite)
npm run build     # production build, output in dist/
npm run preview   # preview the production build locally
npm run lint       # oxlint
```

Then open the printed local URL (typically `http://localhost:5173`).

## Environment variables

None required. The prototype has no backend, no API keys, and no secrets —
all data is either bundled seed data (`src/data/`) or written to the
browser's `localStorage` at runtime.

## Demo roles

On the login screen, choose one of three roles. Enter any 10-digit mobile
number, then use OTP `123456` on the verification screen (demo-only, no
real SMS is sent).

| Role | What they can do |
| --- | --- |
| **Citizen** | Browse the bin/public-toilet map, report an issue, track their own complaints |
| **Government Official** | See every complaint city-wide, assign a worker, set priority, view bin/toilet/worker analytics |
| **Sanitation Worker** | See tasks assigned to them, start work, mark a task resolved with a note/photo |

Each role only sees the screens meant for it — role-based route guards
redirect anyone who isn't signed in as the right role back to login.

## Demo workflow (single shared complaint)

1. **Citizen** → Report an Issue → *Overflowing Bin* at *Gomti Nagar, Lucknow* → Submit.
   The seed complaint `SSB2026-0048` already ships in this exact state (`SUBMITTED`) so the flow can also be shown without submitting a new one.
2. **Government Official** → Complaints → open the complaint → Assign Worker → *Vikash Kumar*. Status becomes `ASSIGNED`.
3. **Sanitation Worker** (signed in as Vikash Kumar, the default demo worker) → My Tasks → open the task → **Start Work**. Status becomes `IN_PROGRESS`.
4. **Citizen** → My Complaints → the same complaint now shows `IN_PROGRESS`.
5. **Worker** → same task → **Mark as Resolved** (with an optional note/photo). Status becomes `RESOLVED`.
6. **Citizen** and **Government Official** → both now see the same complaint as `RESOLVED`, with the same ID, location, description, and assigned worker throughout.

For the full judge-facing script (timing, talking points, and an
architecture explainer), see **`SIH_DEMO_GUIDE.md`**. For a checklist
version of the same flow, see **`SIH_DEMO_CHECKLIST.md`**. For
prepared answers to likely judge questions, see **`SIH_JUDGE_QA.md`**.


## Project structure

```
src/
  components/   Shared UI: shells (Citizen/Gov/Worker), badges, cards, map markers, nav bars
  context/      AuthContext — selected role + demo auth state (localStorage)
  data/         Seed data: bins, toilets, workers, complaint constants
  hooks/        useComplaints/useComplaint, useLiveBins, useWorkerSession
  services/     complaintService.js — single source of truth for all complaint reads/writes
  pages/        Citizen, Government (pages/government), Worker (pages/worker) screens
  utils/        Dashboard/analytics aggregation helpers
  App.jsx       Route definitions + role guards
  main.jsx      App entry point
```

## Resetting demo data

Each role's Profile screen (Citizen and Government Official) has a
**Reset Demo Data** button. It restores the four predefined seed
complaints (`SSB2026-0045`–`0048`) and clears anything created during
the session, so the same walkthrough can be repeated cleanly for
multiple audiences without needing to clear browser storage manually.
It never deletes the app itself — only the complaint records in
`localStorage`.

## Deployment

This is a static single-page app (Vite build output in `dist/`) with
no backend, so it deploys to any static host.

- **Vercel** — `vercel.json` is already set up (`npm run build`, output
  `dist/`, SPA rewrite so client-side routes like `/citizen/map` don't
  404 on refresh).
- **Netlify** — `netlify.toml` and `public/_redirects` provide the same
  build settings and SPA fallback.
- **Any other static host** — run `npm run build` and serve the `dist/`
  folder, making sure unknown paths fall back to `index.html` (required
  by React Router's `BrowserRouter`).

No environment variables, API keys, or server-side configuration are
needed.

## Notes for reviewers

- Complaint statuses are always one of `SUBMITTED / ASSIGNED / IN_PROGRESS / RESOLVED` internally; screens only vary the *display label* ("In Progress" vs `IN_PROGRESS`).
- Bin fill-levels update on a timer to simulate a live IoT feed for the demo — this is client-side randomness, not a real sensor integration.
- Data persists across a page refresh (localStorage), but is local to the browser/device — clearing site data resets the demo to its seed state.
