# EcoSetu API

Express + MongoDB Atlas (official `mongodb` driver; Node 22.5+, developed on Node 24). It is the single source of truth for campus locations (buildings, dustbins, public toilets) and worker facility requests. Every role reads the same `/api/locations`.

It runs two ways with the same code: as a normal process (`npm run server`) and as one Vercel function (`api/index.js`, see "Deploying on Vercel").

## Run

```bash
npm install
npm run server      # API on http://localhost:4000
npm run dev         # frontend; Vite proxies /api to :4000
npm run seed        # verified campus + demo data into the configured database (safe to repeat)
npm run migrate     # one-time data migrations after an upgrade (safe to repeat)
npm run test:node   # API + script + client-adapter tests (in-memory MongoDB)
```

Copy the root `.env.example` to `.env` and fill it in: Mongo URI, two JWT secrets, `PHONE_HASH_SECRET`, Firebase project id. In development the server falls back to insecure defaults and warns. In production it **fails closed**: with `NODE_ENV=production` or on any Vercel deployment (`VERCEL=1`), a missing or short secret, a malformed `MONGODB_URI`, or the same secret used twice stops the server at start.

After consent on the start screen, everyone logs in with email + password (or creates an account: a citizen at once, asked to verify the email). Officials and workers log in the same way. The role always comes from the database. There is no anonymous and no phone sign-in.

## Database

MongoDB Atlas (see "MongoDB" below). On every connect the server applies a JSON-schema validator and the indexes to each collection (`server/src/schemas.js`), so the database itself rejects a record with a missing owner, an unknown status or an over-long comment. Collections: `locations`, `facility_requests`, `users`, `pending_roles`, `complaints`, `toilet_ratings`, `notifications`, `consents`, `refresh_tokens`, `auth_rate_limits`, `counters`.

**Seed.** `npm run seed` inserts the verified campus reference and, unless `ECOSETU_SEED_DEMO=false`, the demo buildings, dustbins, public toilets, facility requests and the three demo-login users. Every seed record has a fixed id (`BL-001`, `DB-D01`, `PT-D01`, `FR-2026-001`, `demo-worker`…) and is inserted only if missing, so re-running never duplicates anything or overwrites a record an official has edited since. The local server also seeds on start; the Vercel function does not (run the script against Atlas once).

**Bins** have a categorical status only (`normal`, `almost_full`, `overflow`), never a fill percentage. `statusSource` is `manual` once an official or worker sets the status (the app's demo simulation then leaves that bin alone) and `simulated` otherwise. Records from older builds that stored a percentage are converted by `npm run migrate`.

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

## Complaints, ratings, notifications, consent

All routes and rules are listed at the top of `server/src/routes-civic.js`. In short:

- **Lists** (`/api/complaints`, `/api/notifications`, `/api/locations`, `/api/facility-requests`, ratings…) are paged: `?page=&limit=`, default 20, at most 100 (anything else is a 400). The response is `{ items | locations | requests, page, limit, total, hasMore }`, sorted on a field plus `_id`, so records with the same timestamp never repeat or vanish between pages.
- **Ownership**: a citizen sees only their own complaints, a worker only those assigned to them, officials everything. Someone else's record is a 404, identical to a missing one. Request bodies with unknown fields are a 400; text is trimmed and length-checked.
- **Complaints**: citizens only, rate-limited per user (`ECOSETU_COMPLAINT_RATE_MAX`, 10/hour). A facility report (`facilityType` bin|toilet + `facilityId` + `category` from that type's list; "Other" needs a description) takes its location from the facility, which must exist. The server sets id, status and priority. A second open report by the same user on the same facility and category is a 409 with `existingId` — a unique index makes this hold even for simultaneous requests.
- **Status**: SUBMITTED → ASSIGNED (officials, to an account with the worker role; re-assigning is allowed until work starts) → IN_PROGRESS → RESOLVED (the assigned worker; resolving needs a note). Anything else is a 409; RESOLVED is final. Updates are conditional, so two simultaneous changes can't both win.
- **Votes**: one per user per complaint (`complaint_votes`, unique index); `direction: null` removes it.
- **Ratings**: citizens only, one per user per toilet (rating again replaces it); averages and per-category averages come from MongoDB aggregations; `/api/toilets/ratings/low` (officials) lists live toilets averaging below 3 with at least 3 ratings.
- **Notifications** are created by the server when a citizen's complaint is assigned, started or resolved, and when a worker's facility request is reviewed. Users list and mark only their own.
- **Consent** is versioned (`ECOSETU_CONSENT_VERSION`); saving an older version is a 409. The notice, location and photo items must all be accepted (there is no phone item any more; the default notice version is 2). Withdrawing consent deletes it and signs the user out everywhere at once, including access tokens that haven't expired yet.
- **Delete my data** (`DELETE /api/me/data` with `{ "confirm": true }`) deletes the account, ratings, notifications, votes, consent, sessions and the photos the user attached, in one transaction (the blobs right after it), and anonymises what the municipality keeps: complaints lose their owner and show "Deleted user". Every record that shows an official or worker by name also stores their user id (`createdById`, `deletedById`, `reviewedById`, `assignedWorkerUid`, never sent to clients), and anonymising goes by that id — two people with the same name never affect each other. Records written before these ids existed carry none and are left as they are. The shared demo accounts can't be deleted. The public `/privacy` page explains this to users.
- **The map**: `GET /api/locations/map` returns every live bin and toilet in one response (at most `ECOSETU_MAP_LIMIT`, default 2,000; `truncated` says if there were more) with only `id, type, status, statusSource, latitude, longitude, name, isDemo, ratingAverage`, and `Cache-Control: public, max-age=30`. `GET /api/locations/:id` returns one full record for detail screens, and `GET /api/locations?kind=building|facility` filters the full list.

## Profile, worker directory

- `GET/PATCH /api/profile`: every user has a display name; officials also a government profile (state, district, ministry), starting from the app's defaults. Unknown fields are refused (a citizen sending `district` gets a 400).
- `GET /api/workers` (paged; `?removed=true` for the removed ones), `POST /api/workers`, `DELETE /api/workers/:id` `{ reason? }`, `POST /api/workers/:id/restore` — officials only. Adding a worker takes a name and an email (stored only hashed and masked) and creates a pending worker role for it (see Roles); each entry comes back with `emailMasked` and `accountStatus` (`active`, `invited` or null). A worker removed from the directory can't be assigned complaints until restored.

## Polling and conditional requests

The lists the app polls (complaints, notifications, locations, facility requests, workers, the map) answer `If-None-Match` with `304 Not Modified` and no body when nothing changed. The ETag is a hash of exactly what that user would receive, so it changes with any change in the list (a vote, a status, a read notification) and never matches another user's list. The check is done by `server/src/etag.js`, not Express's built-in one: when a page sets `If-None-Match` itself, browsers (and Node's fetch) also send `Cache-Control: no-cache`, which makes Express always send the full response.

## Security middleware and logging

- `helmet` on every response: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, HSTS, `Cross-Origin-Resource-Policy: same-origin`; plus `Cache-Control: no-store` (except the public map).
- CORS: same-origin needs nothing. Another site gets CORS headers (with credentials) only if listed in `ECOSETU_CORS_ORIGINS`; any other site's request is refused with 403.
- Rate limits, counted in MongoDB per IP: sign-in routes (`ECOSETU_AUTH_RATE_MAX`, 30/min), failed logins, the demo login, every other write (`ECOSETU_WRITE_RATE_MAX`, 120/min); new complaints also per user (10/hour).
- Logging (`server/src/logger.js`): one JSON line per request with only method, path without its query string, status, time, role and a request id; an unexpected error logs only its name and message. Headers, cookies, bodies and query strings are never logged, and every line also passes a redaction step for tokens, cookie values, phone numbers, image data and Blob tokens. A 500 reply carries only "Unexpected server error (ref <id>)", to match the log line.

## Photos

Complaint, resolution and facility-request photos are kept in a **private Vercel Blob store** (`server/src/photoStore.js`); MongoDB stores only the blob pathname (`photoPath`, `resolutionPhotoPath`). A private blob's URL doesn't work without a token, so photos are only ever read through the API:

- `GET /api/complaints/:id/photo` and `/resolution-photo`, `GET /api/facility-requests/:id/photo` stream the photo after the same ownership check as the record (owner, assigned worker, officials); anyone else gets the same 404 as for a missing record. Responses are `Cache-Control: private, no-store`.
- Uploads happen after auth, validation (JPEG/PNG/WebP, at most 1 MB) and rate limiting. A report refused after its upload (e.g. a duplicate) deletes the photo again.
- Deleting a complaint (officials) and "delete my data" delete the blobs. A failed delete never fails the request: it is logged and queued in `blob_deletions`, and the daily Vercel Cron job (`/api/cron/blob-deletions`, needs `CRON_SECRET`) retries it.
- Lists never read photo fields from the database (`complaintListPipeline` in `civic.js`, unit-tested).
- Photos older builds kept as base64 in MongoDB are moved by `npm run migrate` (needs the Blob store; without one it stops and says how many are waiting).

Before the move, measured on 100 complaints: about 47 MB with typical 350 KB photos and up to 267 MB at the 1 MB cap with resolution photos — a large part of the Atlas free tier. Vercel's Hobby plan includes 1 GB of Blob storage; if a Hobby project exceeds its Blob limits, Blob is unavailable until the 30-day window resets (no charge).

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

- Real-time is polling: every 30 s, only while the tab is visible (one refresh when it is shown again), with conditional requests — an unchanged list answers 304 with no body. There is no WebSocket layer.
- With `VITE_USE_API=true` the web app uses these routes for everything except the citizen's local settings (chosen city, alert switches) and the demo worker switcher, which stay on the device.
- Photos are JPEG/PNG/WebP data URLs of at most 1 MB (the web app compresses before sending); request bodies are capped at 4 MB.
- Supervisor and super-admin exist on the server only; the app has no screens for them.
- Switching the demo worker on the Worker profile screen doesn't change the server identity (set at login).


## Sessions: Firebase Authentication + server-issued JWTs

1. **Firebase signs the user in, in the browser**: "Create account"
   (`createUserWithEmailAndPassword`, then the verification email) or "Log in"
   (`signInWithEmailAndPassword`). The browser gets a Firebase ID token.
2. **`POST /api/auth/firebase`** (alias `/api/auth/firebase-login`) verifies that token (RS256 signature
   against Google's public keys, issuer, audience = `ECOSETU_FIREBASE_PROJECT_ID`,
   expiry) and reads its `sign_in_provider`:
   - `password`: the role the database holds; a new account is a citizen.
     An account's first sign-in (a sign-up) counts against a per-IP limit
     (`ECOSETU_SIGNUP_RATE_MAX`, default 20/hour); returning ones don't. The
     email is stored only as a keyed hash and a masked copy (see "Emails"). A
     role granted to that email applies only when the token says the email
     is verified. Another account with the same email is a 409.
   - `anonymous`: refused with a 403 ("Continue without account" is gone;
     `npm run migrate` removes the accounts it made).
   - `phone`: only accounts the old phone sign-in made (they keep working
     until saved with an email); a new phone account is a 403.
   - anything else is a 403.

   It then returns:
   - an **access token**: JWT, 15 min, payload `{ sub: <user id>, role }`,
     signed with `ECOSETU_JWT_SECRET`, sent as `Authorization: Bearer`;
   - a **refresh token**: JWT, 7 days, signed with `ECOSETU_JWT_REFRESH_SECRET`,
     set as an httpOnly cookie (`ssb_refresh`, path `/api/auth`). Only its
     SHA-256 hash is stored, in MongoDB.

   Both name the environment that issued them in their audience: access
   `ecosetu-production` / `ecosetu-preview` / `ecosetu-development`, refresh
   the same plus `-refresh`. The environment is Vercel's `VERCEL_ENV`;
   elsewhere `production` with `NODE_ENV=production`, otherwise
   `development`. A server accepts only its own environment's tokens, so a
   preview's token is refused by production even if a secret were shared. An
   unknown `VERCEL_ENV` stops the server at start.
3. **`POST /api/auth/refresh`** rotates the refresh token (each works once) and
   returns a new access token. Presenting a token that was already used or
   revoked is treated as theft: every refresh token of that user is revoked, so
   all their devices are signed out.
4. **`POST /api/auth/logout`** revokes the refresh token and clears the cookie.
5. **`POST /api/auth/demo`** `{ role }` (citizen | worker | official, or
   government) signs in as one of the three seeded demo users. The route exists
   only when `DEMO_LOGIN_ENABLED=true` (otherwise it is a plain 404), any other
   field is a 400, the role comes from the database, it has its own rate limit
   (`ECOSETU_DEMO_RATE_MAX`, default 10/min), and a Firebase login can never
   reach a demo account.

### The web client (`VITE_USE_API=true`)

`src/services/session.js` keeps the access token in memory only and restores
it from the refresh cookie on page load. Because a reused refresh token signs
the user out everywhere, it never sends two refreshes with the same cookie:
parallel 401s in a tab share one refresh; the page-load restore runs once even
under React StrictMode; across tabs, `navigator.locks` lets one tab refresh and
the others adopt its result over `BroadcastChannel` (without Web Locks, tabs
claim the refresh on the channel and the lowest claim wins). A refused refresh
clears the token. Staff return to the start screen with "Your session has
expired. Please log in again.", citizens included (there is no silent
sign-in).

The cookie is `SameSite=Strict` when the site and API share an origin (dev proxy,
single host) and `SameSite=None; Secure` when the frontend is on another origin
listed in `ECOSETU_CORS_ORIGINS`. `refresh`/`logout` also require the
`X-EcoSetu-Client: web` header (CSRF guard). `/api/auth/*` is rate-limited per
IP (`ECOSETU_AUTH_RATE_MAX`, default 30/min) and repeated failed logins are
throttled (`ECOSETU_LOGIN_FAIL_MAX`, default 10 per 10 min). Both counters live
in the `auth_rate_limits` collection (expired by a TTL index), so every server
instance shares one limit; on Vercel the client address is taken from
`X-Real-IP`, which Vercel sets itself.

In production the server refuses to start without both JWT secrets and
`PHONE_HASH_SECRET` (each ≥ 32 chars, all different). In development it uses
random JWT secrets and a fixed email-hash key, and warns.

## Emails

No phone numbers are stored, and no email addresses. An account's user
record keeps:

- `emailHash`: HMAC-SHA256 of the lowercased, trimmed address, keyed with
  `PHONE_HASH_SECRET` (the variable kept its name from the phone sign-in, so
  existing deployments need no change). A plain hash could be reversed by
  guessing likely addresses; with a server-side key a leaked database alone
  reveals nothing. The hash is how `grant-role` finds an account, and a unique
  index keeps one account per address.
- `emailMasked`: `as***@g***.com`, the only form the API ever returns.
- `emailVerified`: from the latest Firebase token.
- `authProvider`: `password`, `phone` (made by the old phone sign-in),
  `demo`, or `anonymous` (made by "Continue without account": they can't sign
  in any more, and `npm run migrate` removes them, keeping their complaints
  anonymised).

Changing `PHONE_HASH_SECRET` after roles were granted by email breaks the
lookup by email (sign-in by uid still works).

Worker-directory contact numbers, entered by officials, are not a sign-in:
they are still kept masked only (`+91 98XXXXXX10`).

## Migrations

Data from older builds is converted by `npm run migrate`, run once after
deploying an upgrade, never on connect (several Vercel instances can
cold-start at the same moment). Today it removes every phone number and
phone hash from the users (no phone sign-in any more; those accounts are
marked `authProvider: "phone"` and keep their uid and role), drops roles still
pending for a phone number (grant them again by email), removes the "phone
for login" consent answers and the phone indexes, re-keys request owners
stored as `role:phone` to uids, and converts bins holding a fill percentage. It logs
what it changed, a second run reports "Nothing to change", and two overlapping
runs are safe. A user who signs in before it has run is converted at that
moment, so nobody is locked out.

### Firebase setup
1. Firebase console → create a project → Authentication → Sign-in method:
   enable **Email/Password**; leave **Anonymous** and **Phone** off.
2. Project settings → add a **Web app**; copy its config into the root `.env`
   (see `.env.example`) and set `ECOSETU_FIREBASE_PROJECT_ID` to the project id.
3. Authentication → Settings → **Authorized domains**: add your deploy domain.
4. Authentication → Templates → Email address verification and Password
   reset: set a sender name; "Create account" and "Forgot password?" send them.

## Roles

A client can't choose a role: `firebase-login` refuses any role it is sent. A
new account is a **citizen**.
A staff role is granted to an **email**, kept only as an HMAC and a masked
copy in `pending_roles`, and applies only when the account signs in with that
email **verified**, so typing someone else's address gets nobody their role.
A user whose role changes gets a new access token on their next refresh.

- **Officials: `npm run grant-role` (bootstrap only).**

  ```
  npm run grant-role -- <email> <citizen|government|supervisor|superadmin>
  ```

  `government` is the app's `official` role. If a verified account has that
  email the role applies now; otherwise it waits in `pending_roles`.
  `citizen` takes a role away. It refuses `worker`, and there is no
  `--worker-id` any more. Emails are masked in its output.
- **Workers: only from the official's worker directory** (`POST
  /api/workers` with `{ name, email, area?, status? }`). The directory entry
  keeps `emailHash` and `emailMasked`; a pending worker role for that email
  points at the entry. When that person creates (and verifies) an account
  with the email, they become a worker linked to the entry. Removing the
  entry turns a linked account back into a citizen and cancels the pending
  role; restoring it invites again. An email already in the directory, or one
  that belongs to an official, is a 409. Apart from the demo login there is
  no other way to become a worker.

## MongoDB

Data lives in MongoDB Atlas (`MONGODB_URI`, `MONGODB_DB_NAME`); the collections are listed under "Database". The server opens one shared connection at start-up and exits with a
clear message if it can't. In Atlas, allow your server's IP under Network Access.

## Dependency pins

`package.json` has `"overrides": { "zod": "^4.6.7" }`. `@vercel/blob` pulls in `@vercel/oidc` → `@vercel/cli-config`, which pins `zod@4.1.11`, a version with a high-severity advisory (GHSA-mrhx-c7xc-m3w5). The override moves it to the patched 4.6.x. **Remove the override** once `@vercel/blob` (or `@vercel/cli-config`) depends on a fixed `zod` by itself: delete it, run `npm install` and `npm audit`, and keep it removed if the audit stays clean. (`@grpc/grpc-js` is pinned the same way for an older advisory.)

## Deploying on Vercel

Step-by-step (Git, Atlas, Blob, Firebase, environment variables, checks): `docs/DEPLOYMENT.md`.

The web app and the API deploy as one Vercel project, so they share an origin
(no CORS, `SameSite=Strict` refresh cookie). `vercel.json` rewrites `/api/*` to
`api/index.js`, which wraps the Express app in `lazyApp()`
(`server/src/serverless.js`): the first request on a cold instance loads the
config, connects to Atlas (small connection pool), applies the collection
validators and indexes, and builds the app (data migrations are a separate
step, `npm run migrate`); every later request on that instance reuses
it. A failed start-up answers 503 and is retried on the next request. Set the
server variables from `.env.example` in the Vercel project settings; Vercel
sets `VERCEL=1` itself. Request bodies over 4.5 MB never reach the function.

### First deployment of this version: wipe and reseed

The data in the existing database is demo data only, and records written by
earlier versions lack the user ids that "delete my data" now relies on
(`createdById`, `reviewedById`, `assignedWorkerUid`…). Rather than backfill
them, start from a clean database:

1. In Atlas → your cluster → Browse Collections, drop the database named in
   `MONGODB_DB_NAME` (default `ecosetu`). Or with mongosh:
   `use ecosetu` then `db.dropDatabase()`.
2. Deploy. The first request creates the collections, validators and indexes.
3. From your machine, with the production values in `.env`:
   `npm run migrate` (nothing to do on an empty database, but it confirms
   the connection and the Blob store) and then `npm run seed`.
4. Open the app, create an account, and try the demo login, to check.

Do this only while the database holds demo data. Once real users exist, never
drop it: write a migration instead.

### Migrating the old SQLite data
```
npm run migrate:sqlite                       # reads server/data/ecosetu.db
npm run migrate:sqlite -- path/to/other.db   # a different file
npm run migrate:sqlite -- --dry-run          # show what would be copied
```
Safe to re-run: rows are upserted by id and never overwritten.
