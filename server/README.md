# EcoSetu API

Express + SQLite (Node's built-in `node:sqlite`, Node 22.5+; developed on Node 24). It is the single source of truth for campus locations (buildings, dustbins, public toilets) and worker facility requests. Every role reads the same `/api/locations`.

## Run

```bash
npm install
npm run server      # API on http://localhost:4000
npm run dev         # frontend; Vite proxies /api to :4000
npm test            # API + client-adapter tests
```

Copy `server/.env.example` to `.env` and set the secrets. In development the server falls back to insecure defaults and warns; in production (`NODE_ENV=production`) it refuses to start without them.

Every role logs in with a mobile number and OTP `123456`. Access codes are only required when `ECOSETU_REQUIRE_ACCESS_CODES=true` (see "Access codes" below).

## Database

`server/data/ecosetu.db`, created and migrated automatically on start (`PRAGMA user_version`). To add a migration, append SQL to `MIGRATIONS` in `server/src/db.js`. Tables: `locations`, `facility_requests`. To reset, delete `server/data/` and restart (the seed runs on an empty DB).

## Endpoints

| Method | Path | Who |
|---|---|---|
| GET | `/api/health` | anyone |
| POST | `/api/auth/login` | anyone (`{role, mobile, accessCode?, workerId?}`) |
| GET | `/api/auth/me` | signed in |
| GET | `/api/locations?type=&q=` | anyone |
| GET | `/api/locations/removed` | official, superadmin |
| POST | `/api/locations` | official, superadmin |
| PATCH | `/api/locations/:id` | official, superadmin |
| DELETE | `/api/locations/:id` `{reason}` | official, superadmin (soft delete) |
| POST | `/api/locations/:id/restore` | official, superadmin |
| GET | `/api/facility-requests[/:id]` | worker (own), supervisor/official/superadmin (all) |
| POST | `/api/facility-requests` | worker, supervisor |
| PATCH | `/api/facility-requests/:id/status` | official/superadmin: APPROVED, REJECTED, UNDER_REVIEW; supervisor: UNDER_REVIEW only |

Approving a request publishes its location in the same transaction. The verified campus reference (`type: campus`) cannot be edited or deleted.

## Verified vs demo data

- **Verified:** COER University campus, OpenStreetMap way 1213831733 (centroid 29.8905429, 77.9594553; bbox 29.8873215–29.8937887 / 77.9574428–77.9628839), © OpenStreetMap contributors, ODbL. The map opens on 29.8905551, 77.9601633 (supplied by the project owner).
- **Demo (`isDemo: true`, description starts with "DEMO"):** every building, dustbin, toilet and seeded request in `server/src/seed-data.js`. Their coordinates are illustrative points inside the campus bounding box, not surveyed positions.

## Importing verified coordinates

Make a CSV with the header `name,type,latitude,longitude,address,description,source_url` (types: `academic_building, department_building, library, admin_block, hostel, canteen, main_gate, dustbin, public_toilet`), then:

```bash
node server/scripts/import-locations.js my-buildings.csv --replace-demo
```

The whole file is rejected if any row is invalid. `--replace-demo` hides the simulated placeholders. You can also add or edit one at a time as an official: **Add Facility** (tap the map or type coordinates) and **Campus Buildings → Edit**.

## Limits

- Real-time is polling every 8 s (plus on tab focus); there is no WebSocket layer.
- Complaints, the worker directory and the Government profile are still browser-local; only locations and facility requests moved to the API.
- Supervisor and super-admin exist on the server only; the app has no screens for them.
- Switching the demo worker on the Worker profile screen doesn't change the server identity (set at login).

## Access codes

Staff login is mobile number + OTP `123456`, same as citizens. **This means anyone can sign in as an official or worker**, so do not expose a server configured this way to the public. Set `ECOSETU_REQUIRE_ACCESS_CODES=true` to make workers, supervisors and officials enter their role's access code; the app then shows the extra field automatically.
