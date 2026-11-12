# EcoSetu security and privacy checklist

Covers Step 15 (Features 1–5) and Step 16 (Phases 1–6). Status as of
2026-11-13. Every **Pass** and **Fixed** item has automated tests (Vitest in
`src/`, Node test runner in `server/test/`); the main test file is named in
brackets.

Status key: **Pass** = already met when checked · **Fixed** = changed to meet
it · **Open** = not done yet (with the plan) · **N/A** = does not apply.

## A. The Step 15 checklist

| # | Item | Status | Reason |
|---|------|--------|--------|
| 1 | No secret keys in the frontend; only public Firebase web config via `VITE_` vars | Pass | `src/` holds only `VITE_FIREBASE_*` (public by design, access is controlled in the Firebase console). Server secrets live in server env vars only. Grep of `src/` for keys and secrets finds nothing. |
| 2 | `.env*` git-ignored and not in git history | Fixed / Open | `.gitignore` ignores `.env` and every `.env.*` except `.env.example`, plus `.vercel` (checked in a scratch repository). The project folder is not a git repository yet, so the history check is in `docs/DEPLOYMENT.md` section 1.4. |
| 3 | Worker and Government routes behind `RequireRole`; an OTP citizen can't reach them by URL | Pass | Every staff route is wrapped in the app (`ChooseRole.test.jsx`, `apiAuth.test.jsx`). Since Phase 2 the server enforces the role from the database on every API route, so editing the browser can't help (`api.test.js`). |
| 4 | IDOR: a citizen can open and edit only their own complaints, ratings and profile | Fixed | Enforced on the server, with someone else's record a 404 indistinguishable from a missing one. Covers complaints, their photos, facility requests, notifications, ratings, consent and the profile (`complaints.test.js`, `photos.test.js`, `privacy.test.js`, `directory.test.js`). |
| 5 | User text validated, trimmed, length-limited and rendered as text; no `dangerouslySetInnerHTML` | Pass | No `dangerouslySetInnerHTML`, `innerHTML` or `insertAdjacentHTML` in `src/`. The map's HTML pins are built only from fixed icons, colours and counts. Every request body is checked on the server: unknown fields refused, text trimmed, over-long text a 400. MongoDB JSON-schema validators are a second line (`schema.test.js`). |
| 6 | Phone and OTP inputs validated; OTP brute force limited | Pass | Client: `+91` and 10 digits starting 6–9, a 6-digit OTP, and a 30 s resend cooldown (`phoneAuth.test.js`). Firebase limits OTP attempts. The server throttles failed logins per IP (`api.test.js`). |
| 7 | Photo uploads: image types only, size capped | Fixed | Client compresses to under 1 MB. Server accepts only JPEG/PNG/WebP data URLs of at most 1 MB, with a 4 MB body limit (`photos.test.js`, `imageCompression.test.js`). |
| 8 | Every localStorage read survives corrupted JSON | Pass | All nine `JSON.parse` calls on stored data sit inside `try` with a safe default (checked by hand); corrupted session storage is tested (`authSession.test.js`). |
| 9 | Friendly error states; app-level React error boundary | Fixed | API screens show loading and error-with-retry states, and failed actions show the server's reason (`apiMode.test.jsx`). The whole app is wrapped in an error boundary: a crashed screen shows a friendly page with a Reload button and a reference number (EC-XXXX-XXXX), never the error text or a stack. Only the error type and the reference are logged; React's own logging of the full error is switched off at the root (`AppErrorBoundary.test.jsx`, `appErrorScreen.test.jsx`). |
| 10 | `npm audit`: fix high and critical issues | Fixed | `found 0 vulnerabilities`, for all packages and for production only (`npm audit --omit=dev`), on 2026-11-13. The web app and the API share the root `package.json`. Fixed along the way: `qs`/`body-parser`/`follow-redirects` (`npm audit fix`), and `zod` under `@vercel/blob`, pinned with `overrides` (see `server/README.md`, "Dependency pins", on when to remove it). |
| 11 | Security headers in `vercel.json` | Fixed | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (geolocation and camera for this site only, no microphone) and HSTS (`security.test.js`). The OpenStreetMap map is drawn with Leaflet tiles, not framed, so `DENY` doesn't affect it. |
| 12 | Automated tests for every feature | Pass | Frontend: 298 tests (30 files, 5 skipped: API-only or browser-only journeys). Server: 275 tests (21 files). Both suites passed three runs in a row on 2026-11-13. Every feature also ran deliberate fault injection; every fault was caught (where a fault first slipped through, a test was added and the fault re-run). |

## B. Authentication and sessions (Phases 1–2)

| Item | Status | Reason |
|------|--------|--------|
| Roles come from the database, never from the client | Fixed | Login bodies with `role` or any extra field are refused. A new account is a citizen; only `npm run grant-role` changes that (`api.test.js`). |
| Access token: 15 min, `{ sub, role }` only, in memory only | Fixed | Never written to localStorage or sessionStorage (`session.test.js`). |
| Refresh token: httpOnly, Secure, SameSite=Strict cookie; stored hashed; rotated; reuse revokes every session | Fixed | Covered by `api.test.js`. |
| No accidental sign-outs from refresh races | Fixed | Requests in one tab share a single refresh; page load restores once even under React StrictMode; tabs coordinate with Web Locks, falling back to BroadcastChannel (`session.test.js`, including two tabs in the same instant). |
| Refused refresh → login page with a clear message | Fixed | Covered by `apiAuth.test.js`. |
| Demo login off unless `DEMO_LOGIN_ENABLED=true`; client chooses only which demo user; own rate limit; Firebase can't reach demo accounts | Fixed | Covered by `demo-login.test.js`. |
| Production fails closed | Fixed | With `NODE_ENV=production` or on any Vercel deployment, start-up stops if a JWT or phone-hash secret is missing, short or reused, `MONGODB_URI` is malformed, or there is no private Blob store (`config.test.js`). |
| Withdrawing consent signs out everywhere at once | Fixed | Unexpired access tokens stop working too (`privacy.test.js`). |

## C. Personal data (Phases 1, 3, 4)

| Item | Status | Reason |
|------|--------|--------|
| Phone numbers never stored | Fixed | Only an HMAC-SHA256 (keyed with `PHONE_HASH_SECRET`) and a masked copy. Old records are converted by `npm run migrate` (`phone.test.js`, `migrations.test.js`). |
| Masked phone is the only phone data returned | Fixed | Applies to users and the worker directory (`phone.test.js`, `directory.test.js`). |
| Photos private | Fixed | Stored in a private Vercel Blob store; MongoDB holds only the pathname. Served only through ownership-checked routes, with `Cache-Control: private, no-store`. Never a public URL (`photos.test.js`, `apiMode.test.jsx`). |
| Lists never read photo data | Fixed | The list projection is unit-tested (`photos.test.js`). |
| Delete my data | Fixed | Deletes the account, ratings, notifications, votes, consent, profile, sessions and attached photos in one transaction. Complaints are kept anonymised. A test checks that no trace of the user's id or name is left (`privacy.test.js`). |
| Anonymisation by user id, never by display name | Fixed | Two officials, or two workers, with the same name are tested (`actors.test.js`). Records written before user ids were stored have none; the deployment notes say to wipe and reseed the demo-only database. |
| Failed blob deletes never fail the user's request; retried daily | Fixed | Covered by `photos.test.js`. |
| Cron endpoint needs the exact `CRON_SECRET`; absent without one | Fixed | Constant-time comparison (`security.test.js`, `photos.test.js`). |
| Consent versioned on the server | Fixed | An older version gets a 409 (`privacy.test.js`). |
| First-login consent screen | Fixed | Every role's pages are behind it (phone and demo logins). Separate boxes; Continue stays disabled until the required ones are ticked; the phone box only for phone-login users. One consent record per account on the server, versioned: a changed notice asks again and says why (`consent.test.jsx`, `consentService.test.js`, `privacy.test.js`). |
| Privacy notice with the data tables | Fixed | `/privacy`: what is collected (data, why, where, required?) and every place data goes — Firebase Authentication, MongoDB Atlas (region placeholder), Vercel Blob, Vercel request logs, OpenStreetMap Nominatim (third party, locations rounded to about 11 m and map searches), OpenStreetMap map tiles and Google Fonts — with what, why and how long it is kept, that complaints are kept anonymised after "delete my data", and a contact line (placeholder). Content in `src/data/privacy.js` (`PrivacyNotice.test.jsx`). |
| Withdraw consent vs delete my data | Fixed | Two separate screens, each saying which one it is. Withdraw: signs out everywhere, stops new collection, keeps the data. Delete: lists exactly what is deleted and what is kept, needs DELETE typed, then deletes on the server first (`accountSettings.test.jsx`). |
| Firebase sign-in account deleted with "delete my data" | Fixed | After the server deletion: a fresh OTP (re-verification of the signed-in Firebase user, or a new sign-in that must be the same account), then `user.delete()` on the device. `auth/requires-recent-login` and a different number ask for a new code; nothing else is lost (`authDelete.test.js`, `accountSettings.test.jsx`). Demo accounts can't reach the flow and the server refuses them (403). |
| Showing the consent screen at presentations | Fixed | "Reset demo consent" in a demo account's profile clears consent for the demo accounts only. The route exists only with `DEMO_LOGIN_ENABLED=true` and refuses real accounts (`demo-login.test.js`). |
| Ratings (Feature 3) and facility reports (Feature 4) | Fixed | One rating per user per toilet; comments rendered as plain text; only citizens rate. A second open report on the same facility and category shows the open one ("You already reported this"). Both work through the API and in the browser-only build (`ratings.test.jsx`, `facilityReport.test.jsx`, `apiMode.test.jsx`). |

## D. API hardening (Phases 3–5)

| Item | Status | Reason |
|------|--------|--------|
| Security headers (`helmet`) | Fixed | CSP `default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, nosniff, no-referrer, HSTS, CORP same-origin, no `X-Powered-By` (`security.test.js`). |
| CORS | Fixed | Same-origin by default. Only sites listed in `ECOSETU_CORS_ORIGINS` get CORS headers; any other site's request gets 403. Tested: requests with no `Origin`, the production domain, and Vercel preview domains calling their own API all work (`security.test.js`). |
| Rate limits (counted in MongoDB, shared by every instance) | Fixed | Signed-in traffic is counted per user (writes 60/min, complaints 10/hour) so a shared college or hackathon IP doesn't block everyone; tested with 20 users behind one IP. Only unsigned routes count per IP: sign-in 120/min, demo login 60/min, failed logins 30 per 10 min. Refresh is counted per session. On Vercel the IP comes from `X-Real-IP`, which callers can't spoof (`api.test.js`, `security.test.js`, `complaints.test.js`). |
| Request logging without secrets | Fixed | Only method, path (no query string), status, time, role and request id. Plus a redaction step for tokens, cookies, phone numbers, image data, Blob tokens and coordinates. A test sends all of these and checks the log; another checks that a normal request or error line (status, time taken, request id, reference) comes through unchanged (`security.test.js`). |
| Errors in production | Fixed | A 500 returns only a reference id, with no stack or details (`security.test.js`). |
| Validation of every body; unknown fields refused; MongoDB operators can't get in | Fixed | Covered by `complaints.test.js`, `ratings.test.js`, `privacy.test.js`. |
| Pagination on every list | Fixed | Default 20, at most 100, sorted with an `_id` tiebreak (`complaints.test.js`). |
| Ownership checks on the server, 404 for non-owners | Fixed | See A.4. |
| Complaint state machine, duplicate open reports (unique index), one vote per user (unique index) | Fixed | Covered by `complaints.test.js`. |
| Public map cache holds nothing user-specific | Pass | `/api/locations/map` sends `public, max-age=30`. Identical bytes for anonymous users, citizens and officials, and no requester data (`map.test.js`). |
| OpenStreetMap Nominatim usage policy | Fixed | Place search runs only on Search/Enter, never while typing. The API makes every Nominatim call: one shared slot in MongoDB keeps the whole app at 1 request a second, results are cached for a week, every request carries the app's User-Agent, a 429 backs off for 30 s and the user sees "Search is busy, try again in a moment". Signed-in users only, 30 lookups a minute each. The browser also spaces its own requests a second apart and caches them for the session (`geocode.test.js`, `placeSearch.test.jsx`). Overpass is no longer called anywhere and was removed from the CSP. |
| Location privacy | Fixed | Request logs never hold coordinates, addresses or search words: the path is logged without its query string, errors in place lookups are logged without their message, and any coordinate-looking number is redacted. The geocode cache holds only the lookup key (search words, or a position rounded to 4 decimals, about 11 m), the answer and an expiry — no user id (`security.test.js`). The complaint location picker looks up the street address once, after the GPS position settles (under 50 m, or 3 s without moving), and again only if the pin is dragged more than 25 m (`addressLookup.test.js`, `ComplaintLocationPicker.test.jsx`). |
| Polling cost | Fixed | Every 30 s, only while the tab is visible, with conditional requests (304 when unchanged) (`poller.test.js`, `conditional.test.js`, `directory.test.js`). |

## E. Open items

1. Fill in the two placeholders in `src/data/privacy.js`: `PRIVACY_CONTACT` and `ATLAS_REGION`.
2. Content-Security-Policy for the static site. Sent as `Content-Security-Policy-Report-Only` (OpenStreetMap tiles and embed, Nominatim, Google Fonts, Firebase Auth and reCAPTCHA, the API). Switch it to enforcing once a full run shows no console violations; see `docs/DEPLOYMENT.md` section 7. The API already enforces a strict CSP.
3. Check git history for `.env` files once the project is in a git repository. Exact steps: `docs/DEPLOYMENT.md` section 1. `.gitignore` now ignores every `.env.*` except `.env.example`.
4. The main JavaScript bundle is 1.1 MB (310 kB gzipped); Vite warns above 500 kB. Not a security issue; splitting the India places list and the map off the first load would speed up the first visit.
