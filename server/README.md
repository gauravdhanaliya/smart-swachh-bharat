# EcoSetu API

Express + MongoDB Atlas (official `mongodb` driver; Node 22.5+, developed on Node 24). It is the single source of truth for campus locations (buildings, dustbins, public toilets) and worker facility requests. Every role reads the same `/api/locations`.

## Run

```bash
npm install
npm run server      # API on http://localhost:4000
npm run dev         # frontend; Vite proxies /api to :4000
npm test            # API + client-adapter tests
```

Copy the root `.env.example` to `.env` and fill it in (Mongo URI, two JWT secrets, Firebase project id). In development the server falls back to insecure defaults and warns; in production (`NODE_ENV=production`) it refuses to start without them.

Everyone logs in with a mobile number and a Firebase Phone Auth OTP; the role comes from the database.

## Database

MongoDB Atlas (see "MongoDB" below). Indexes are created automatically on start, and the seed runs once on an empty database. Collections: `locations`, `facility_requests`, `users`, `refresh_tokens`, `counters`.

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


## Sessions: Firebase Phone Auth + server-issued JWTs

1. **Firebase proves the phone number.** The browser runs Phone Auth (OTP) and
   gets a Firebase ID token.
2. **`POST /api/auth/firebase-login`** verifies that token (RS256 signature
   against Google's public keys, issuer, audience = `ECOSETU_FIREBASE_PROJECT_ID`,
   expiry), takes the phone number from it, upserts the user in MongoDB by
   Firebase uid and returns:
   - an **access token**: JWT, 15 min, payload `{ uid, role }`, signed with
     `ECOSETU_JWT_SECRET`, sent as `Authorization: Bearer`;
   - a **refresh token**: JWT, 7 days, signed with `ECOSETU_JWT_REFRESH_SECRET`,
     set as an httpOnly cookie (`ssb_refresh`, path `/api/auth`). Only its
     SHA-256 hash is stored, in MongoDB.
3. **`POST /api/auth/refresh`** rotates the refresh token (each works once) and
   returns a new access token; replaying an old one revokes the user's others.
4. **`POST /api/auth/logout`** revokes the refresh token and clears the cookie.

The cookie is `SameSite=Strict` when the site and API share an origin (dev proxy,
single host) and `SameSite=None; Secure` when the frontend is on another origin
listed in `ECOSETU_CORS_ORIGINS`. `refresh`/`logout` also require the
`X-EcoSetu-Client: web` header (CSRF guard). `/api/auth/*` is rate-limited per
IP (`ECOSETU_AUTH_RATE_MAX`, default 30/min).

In production the server refuses to start without both JWT secrets (≥ 32
chars, different from each other). In development it uses random ones and warns.

### Firebase setup
1. Firebase console → create a project → Authentication → enable **Phone**.
2. Project settings → add a **Web app**; copy its config into the root `.env`
   (see `.env.example`) and set `ECOSETU_FIREBASE_PROJECT_ID` to the project id.
3. Authentication → Settings → **Authorized domains**: add your deploy domain.
4. For free testing, add fixed **test phone numbers** (Authentication → Phone).

## Roles

A client can't choose a role: `firebase-login` ignores any role it is sent. A
new account is a **citizen**; everything else is granted by an admin with
database access, using the scripts below. Roles live in the `users` collection.

```
npm run grant-role -- <phone> <citizen|worker|government> [--worker-id w1]
npm run seed-demo-roles                      # numbers from DEMO_*_PHONE in .env
npm run seed-demo-roles -- <citizen> <worker> <government>
```
`government` is the app's `official` role (supervisor and superadmin are also
accepted by `grant-role`). If the person hasn't signed in yet, the role is saved
in `pending_roles` and applied at their first sign-in. A user whose role changes
gets a new access token on their next refresh. Phone numbers are masked in
script output.

## MongoDB

Data lives in MongoDB Atlas (`MONGODB_URI`, `MONGODB_DB_NAME`). Collections:
`locations`, `facility_requests`, `users`, `pending_roles`,
`refresh_tokens` (TTL-expired), `counters`. The server opens one shared connection at start-up and exits with a
clear message if it can't. In Atlas, allow your server's IP under Network Access.

### Migrating the old SQLite data
```
npm run migrate:sqlite                       # reads server/data/ecosetu.db
npm run migrate:sqlite -- path/to/other.db   # a different file
npm run migrate:sqlite -- --dry-run          # show what would be copied
```
Safe to re-run: rows are upserted by id and never overwritten.
