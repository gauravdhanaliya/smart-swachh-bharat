# EcoSetu

A prototype web app that connects citizens, government officials, and sanitation workers around a single sanitation complaint, from the moment it's reported to the moment it's resolved.

## Overview

In most cities, reporting a sanitation problem like an overflowing bin or a broken public toilet means a phone call, a form at an office, or just giving up. Once that report is made, the person who filed it has no way to see what happens next. The official in charge of the area has no single place to see every open issue across the city. The worker who actually has to go fix it often finds out secondhand, with no record of what was asked for or what was already tried.

EcoSetu is our attempt at closing that loop. It's a single web app with three logins: Citizen, Government Official, and Sanitation Worker. Whichever role you sign in as, you're looking at the same underlying complaint data, just through a different lens. A citizen reports an overflowing bin, the official sees it appear on their dashboard and assigns it to a worker, the worker sees it on their task list and marks it resolved with a note and a photo, and the citizen sees the status update in real time. One complaint, one record, three points of view.

## Key features

### Citizen

- Browse a live map of dustbins and public toilets, with filters for category and status
- See real OpenStreetMap-mapped bins and toilets near you, alongside a demo seed set, through the free Overpass API (no Google Maps billing, no API key)
- "Use My Location" to center the map, and a one-tap "Navigate" link that opens Google Maps directions
- Report an issue with a required live camera photo (no gallery upload, so the photo has to be taken on the spot), a description, and a location picked from a searchable India-wide picker (every state, district, and city, plus GPS)
- Track your own complaints by status: Submitted, Assigned, In Progress, Resolved
- An Eco Guide page with six sustainability topics (segregation, composting, going plastic-free, saving water, saving energy, going green), each with a short illustrated how-to and a "did you know" fact
- A notifications feed for complaint and resolution updates, with per-type toggles
- A Help & Support page with an FAQ and the complaint lifecycle explained in plain language
- Add and remove your own custom locations on top of the built-in city list

### Sanitation Worker

- A task list of complaints assigned to you, with one tap to start work and one to mark resolved (with a note and photo)
- A map view of your assigned area
- Request a new bin or public toilet placement, with a location picked on the map or by GPS, which goes to the government queue for approval
- Track the status of your own facility requests
- A notifications feed and a profile page

### Government Official

- A dashboard with city-wide complaint counts, bin and toilet stats, and worker status, centered on your chosen district
- A full complaints list with the ability to open any complaint, assign it to a specific worker, and set its priority
- Add new bins and public toilets to the map, or take one off the map (with a reason recorded and a short undo window, never a hard delete)
- Review and approve or reject facility requests submitted by workers
- Manage the worker directory: add, remove, and view worker status
- Analytics on complaint volume and resolution over time
- An editable profile (name, district, department) instead of a fixed identity

## Tech stack

- React 19 with Vite for the UI and build tooling
- React Router v7 for client-side routing and role-based route guards
- Tailwind CSS v4 for styling
- Leaflet and React-Leaflet for the interactive map, using free OpenStreetMap tiles
- The Overpass API for live OpenStreetMap point data (real bins and toilets that have been mapped by the OSM community)
- The browser's localStorage as the data layer for this prototype (complaints, facilities, workers, auth state, preferences)

No backend, no database, no real SMS or push service, and no payment integration are used. Everything the app needs to run lives in the browser or comes from the free OpenStreetMap APIs.

## Getting started

### Prerequisites

- Node.js 18 or later
- npm

### Install

```bash
git clone https://github.com/gauravdhanaliya/smart-swachh-bharat.git
cd smart-swachh-bharat
npm install
```

### Run it locally

```bash
npm run dev
```

This starts the Vite dev server. Open the URL it prints, usually `http://localhost:5173`.

### Build for production

```bash
npm run build
```

Output goes to `dist/`. Preview that build locally with:

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

No environment variables or API keys are needed for any of the above.

## Project structure

```
src/
  App.jsx          route definitions and role guards
  main.jsx          app entry point
  components/       shared UI: role shells, cards, badges, map pieces, dialogs
  context/          AuthContext, the demo role/auth state
  data/             seed data: bins, toilets, workers, complaints, India's states/districts/cities, Eco Guide content
  hooks/            useComplaints, useLiveBins, useCity, useGovProfile, and the rest of the state-reading hooks
  pages/            citizen screens, plus pages/government and pages/worker for those roles
  services/         the data layer: complaintService, facilityService, workerService, osmService, and so on
  utils/            small helpers for notifications and dashboard stats
```

Each `services/*.js` file is the single place that reads and writes its slice of data. Screens call into these services and never touch localStorage directly, which is also where a real backend would plug in later.

## How the demo works

This is a prototype, and we want to be upfront about what's real and what's simulated.

- **Real:** the map tiles (OpenStreetMap), and the bin/toilet points pulled live from the Overpass API. Those are actual points the OSM community has mapped, not invented by us.
- **Simulated:** bin and toilet fill levels tick up and down on a timer to feel like a live IoT feed. There is no sensor behind them.
- **Local only:** every complaint, facility request, worker record, and user preference lives in your browser's localStorage. Nothing is sent to a server, because there is no server. Clearing your browser's site data resets everything back to the seed state.
- **Login:** pick a role on the login screen, enter any 10-digit mobile number, and use the OTP `123456` on the verification screen. This is clearly a demo login, no real SMS is sent.
- **Seed data:** a handful of complaints, bins, toilets, and workers ship pre-loaded so the whole citizen-to-official-to-worker flow can be shown without creating anything new first. Each role's profile page has a "Reset Demo Data" button that restores that seed state without touching your identity settings.

The intended walkthrough: sign in as Citizen and report an overflowing bin, sign in as Government Official and assign it to a worker, sign in as Worker and resolve it, then sign back in as Citizen and Official to see the same complaint marked resolved for everyone.

## Known limitations and future improvements

- No real backend. All state is local to one browser, so it can't be shared between devices or survive a cleared cache.
- No real SMS, push notifications, or payment integration.
- No live IoT sensors. Bin fill levels are a client-side simulation, not hardware.
- Bin and toilet coordinates in the seed data are labeled as demo locations, not verified municipal data. The live OSM layer is community-mapped, not an official registry.
- The full "View on map" screen doesn't yet follow the city you've picked elsewhere in the app.
- If we build this further, the next steps are a real backend and database behind `services/`, a genuine SMS/OTP provider, and actual IoT integration for bin fill levels instead of the simulated ticker.

## Team and contact

[TEAM NAME]

- [Member name] - [role/contact]
- [Member name] - [role/contact]
- [Member name] - [role/contact]
