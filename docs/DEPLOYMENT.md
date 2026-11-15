# Deploying EcoSetu

How to get this version from your laptop to Vercel, with MongoDB Atlas,
Firebase Authentication (email + password accounts for everyone) and a
private Vercel Blob store. The order matters: Git
first (so nothing is lost), then the services, then the deployment, then the
checks.

Nothing in here has been run for you: no commits and no pushes were made.

---

## 1. Put this folder into your GitHub repository without losing work

This folder is not a Git repository yet, but Vercel deploys from your GitHub
repository's `main` branch (an older version of the app). The steps below put
this folder's files *on top of* that history, on a new branch, so you can
review them in a pull request before anything reaches production.

Use **Git Bash** (installed with Git for Windows) in the project folder.

### 1.1 Safety first

1. Make a copy of the whole folder (you can skip `node_modules`), e.g. to
   `Desktop\ssb-backup-2026-11-13`.
2. This folder is inside **OneDrive**. OneDrive can lock or duplicate files
   inside `.git` while Git is writing them. Either pause OneDrive syncing
   while you work (OneDrive icon → Pause syncing), or move the project to a
   folder outside OneDrive (e.g. `C:\dev\smart-swachh-bharat`) and work there.
3. Find the repository's exact name: Vercel → your project → Settings → Git
   shows "Connected Git Repository" (e.g. `gauravdhanaliya/smart-swachh-bharat`).
   Below it is written as `<repo>`.

### 1.2 Connect the folder to the GitHub history

```bash
git init -b main
git remote add origin https://github.com/gauravdhanaliya/<repo>.git
git fetch origin
# Point this folder at GitHub's main WITHOUT touching your files.
# Afterwards every difference shows up as a change you can review.
git reset --mixed origin/main
git switch -c step-16-backend
git status            # shows modified / new files; nothing is lost
```

`git reset --mixed` only moves Git's pointer and its staging area; it never
changes files in the folder. Do **not** use `git reset --hard` or `git
checkout .` here — those would overwrite your work with the old version.

### 1.3 Make sure no secret is staged

Before staging, check the ignore rules (every line must print a rule from
`.gitignore`):

```bash
git check-ignore -v .env .env.local .env.production server/.env
```

Then stage and check what would be committed:

```bash
git add -A
git diff --cached --name-only | grep -E '(^|/)\.env' # must print ONLY .env.example and server/.env.example
git diff --cached --name-only | grep -E '^(node_modules|dist|\.vercel)/' # must print nothing
git diff --cached | grep -E 'mongodb(\+srv)?://[^ ]*:[^ ]*@|vercel_blob_rw_|BEGIN PRIVATE KEY' # must print nothing
```

If anything unexpected appears: `git restore --staged <file>`, add it to
`.gitignore`, and check again.

### 1.4 Make sure no secret is in the history

The old `main` history may contain files from earlier builds. Check it:

```bash
git log --all --oneline -- .env .env.local .env.production .env.development '*.env' 'server/.env'
git log --all --name-only --format='%h %s' | grep -E '(^|/)\.env' | grep -v '\.env\.example'
```

Both must print nothing. If either prints a commit:

1. Treat every secret in that file as leaked: change the MongoDB password,
   generate new JWT secrets, and rotate the Blob token, in the services and in
   Vercel.
2. Remove the file from the history before pushing anything new
   (`git filter-repo --path <file> --invert-paths`, then a force push of the
   rewritten `main`). Ask before doing this; it rewrites history.

### 1.5 Commit and push (you do this)

```bash
git commit -m "Step 16: backend, sign-in, private photos, API switch, security"
git push -u origin step-16-backend
```

Open a pull request on GitHub. Vercel builds a **preview deployment** for the
branch; test it (section 7) before merging into `main`, which deploys to
production.

---

## 2. MongoDB Atlas

| Setting | Value |
|---|---|
| Cluster | M0 (free) is enough for the demo: 512 MB storage, 500 connections, 100 operations/second |
| Database names | Two databases in the same cluster: **`ecosetu`** for Production and **`ecosetu_preview`** for Preview deployments, chosen by `MONGODB_DB_NAME` (section 5). Testing a pull request then never touches real data. Atlas creates each database on first use. |
| Database user | Create one only for this app: Security → Database & Network Access → Database Users → Add New Database User → Password (use "Autogenerate Secure Password") → **Specific Privileges** → `readWrite` on database `ecosetu`, then **Add Another Privilege** → `readWrite` on database `ecosetu_preview`. Restrict it to this cluster. (For stricter separation, make a second user for previews with only `ecosetu_preview`, and give Preview its own `MONGODB_URI`.) |
| Network access | Vercel functions have no fixed IP addresses, so the IP access list needs `0.0.0.0/0`. Atlas emails an alert when a `/0` entry is added; that is expected. The strong, app-only password is what protects the database. |

Notes:

- **Don't use the Atlas–Vercel integration's user.** It creates a user with
  `readWriteAnyDatabase` on every database, which is more than the app needs.
- **Backups:** an M0 cluster has **no automatic backups**. Atlas offers a paid
  add-on for free clusters ($0.10/day, at most $3/month, daily snapshots, last
  four kept), currently in private preview — check your cluster's Backup tab.
  Otherwise take a manual copy before demos or schema changes:
  `mongodump --uri "<MONGODB_URI>" --db ecosetu --out backup-2026-11-13`
  (the production database; the preview one holds only test data).
- **Inactive clusters:** Atlas pauses an M0 cluster after 30 days with no
  connections.

## 3. Vercel Blob (photos)

1. Vercel → your project → Storage → Create → **Blob**.
2. Set access to **Private**. Photos can show people and homes; a private
   store's URLs don't work without a token, and the app serves photos only
   through its own ownership checks.
3. Connect the store to the project for Production, Preview and Development.
   On Vercel this provides the credentials automatically (`BLOB_STORE_ID`, plus
   `BLOB_READ_WRITE_TOKEN` if you tick that option).
4. Hobby plan: 1 GB of Blob storage is included. If a Hobby project exceeds its
   Blob limits, Blob stops working until the 30-day window resets; there is no
   charge. Complaints are still filed (without the photo) and the citizen is
   told, so the app keeps working.

## 4. Firebase (email sign-in)

On a first visit the start screen asks for consent first; nothing is created
in Firebase or MongoDB before that. Then the card on the start screen is the
login form itself:

- **Log in**: email + password. Used by citizens, officials and workers
  alike. The role always comes from the server: a citizen, unless an official
  or worker role was granted to that **verified** email.
- **Create account**: a new account is a **citizen straight away**; Firebase
  sends the verification email, and the app shows a dismissible "Verify your
  email" banner (with "Resend email") until it is verified.
- **Forgot password?**: sends the reset email.
- **Try the demo** (below the card): Citizen, Sanitation Worker and
  Government Official demo users, only when `DEMO_LOGIN_ENABLED=true`
  (section 8).

There is no anonymous ("Continue without account") or phone sign-in any
more; the API refuses an anonymous token with a 403.

No message says whether an email has an account (wrong password and unknown
email read the same; "Create account" with a used email and "Forgot
password?" never confirm it either). There is no phone sign-in.

1. Authentication → Sign-in method:
   - enable **Email/Password** (leave "Email link (passwordless sign-in)" off);
   - **disable Anonymous** (the app no longer uses it). Existing anonymous
     users in Authentication → Users can be deleted there; `npm run migrate`
     removes their data from the database (section 6);
   - **disable Phone** if it is still on from the previous version (and delete
     any "Phone numbers for testing"). Nothing in the app uses it now.
2. Authentication → Settings → **Authorized domains**: add
   `smart-swachh-bharat.vercel.app` (and your own domain if you add one);
   keep `localhost`. Firebase doesn't accept wildcards, so a preview deployment
   (`…-git-<branch>-gauravdhanaliya.vercel.app`) can only sign in if you add
   that exact domain. Add the branch alias for the branch you test on.
3. Authentication → Templates → **Email address verification** and
   **Password reset**: set the sender name (e.g. "EcoSetu") so both emails
   are recognisable. "Create account" and "Resend email" send the first;
   "Forgot password?" sends the second. A staff role applies only once the
   address is verified.
   Also turn on Authentication → Settings → **Email enumeration protection**
   (on by default for new projects), so Firebase itself doesn't reveal which
   emails have accounts.
4. Project settings → Your apps → Web app: copy its config into the
   `VITE_FIREBASE_*` variables (section 5).

Firebase limits sign-ups per IP on its side as well; the API adds its own
limit on new accounts (section 5, rate limits).

**No service account key is needed.** The server checks Firebase ID tokens
against Google's public signing keys (with the `jose` library), not with
`firebase-admin`. Don't create or download a service-account JSON for this
app. If one was ever committed, delete the key in Google Cloud → IAM →
Service accounts.

## 5. Environment variables (Vercel → Settings → Environment Variables)

Set each for **Production** and **Preview** unless the table says otherwise.
Tick **Sensitive** for every secret (marked below): Vercel then never shows
the value again, not even to you, so **save each secret in a password manager
as you create it**. Generate secrets with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
— a different one for each, **and a different set for Preview and for
Production** (six values for the three secrets marked "different per
environment"). Label them in your password manager, e.g. "EcoSetu Preview —
PHONE_HASH_SECRET".

| Variable | Value | Notes |
|---|---|---|
| `MONGODB_URI` | the Atlas connection string for the app's user | required · Sensitive |
| `MONGODB_DB_NAME` | **Production: `ecosetu`** · **Preview: `ecosetu_preview`** | add it twice, once per environment, with the two values (Vercel lets one name have a different value per environment) |
| `ECOSETU_JWT_SECRET` | random, 32+ characters | required · Sensitive · **different per environment** |
| `ECOSETU_JWT_REFRESH_SECRET` | random, 32+ characters, not equal to the other two | required · Sensitive · **different per environment** |
| `PHONE_HASH_SECRET` | random, 32+ characters, not equal to the other two | required · Sensitive · **different per environment**. Keys the hash of a saved account's email (the name is from the old phone sign-in, kept so nothing needs renaming). **Never change it later** in an environment, or roles granted by email stop matching |
| `ECOSETU_FIREBASE_PROJECT_ID` | your Firebase project id | required |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` | set by connecting the Blob store | required (the server refuses to start without a store) |
| `CRON_SECRET` | random, 16+ characters | Sensitive; for the daily retry of failed photo deletes |
| `VITE_USE_API` | `true` | the app uses the API |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID` | from the Firebase web app | public by design |
| `ECOSETU_GEOCODE_USER_AGENT` | optional | sent to OpenStreetMap Nominatim to identify the app; defaults to `EcoSetu/1.0 (+https://smart-swachh-bharat.vercel.app)` |
| `DEMO_LOGIN_ENABLED` | **leave unset** | set to `true` only around a presentation: see section 8 |

**Why the three secrets differ per environment.** Previews and production use
the same Firebase project, so the same person has the same user id in
`ecosetu_preview` and in `ecosetu`. With shared signing secrets, an access or
refresh token issued by a preview deployment would also verify on production,
and the user it names exists there too. With different secrets a preview
token simply fails to verify on production (401), and the reverse. A
different `PHONE_HASH_SECRET` means an email's hash in the preview database
can't be matched against production either. In Vercel, add each of
the three names twice: once with the Preview value (Preview ticked only) and
once with the Production value (Production ticked only), like
`MONGODB_DB_NAME`. The server already refuses to start if, within one
environment, any two of the three are equal.

A second safeguard needs no setting: every token names the environment that
issued it in its audience (`ecosetu-production`, `ecosetu-preview`, taken
from Vercel's `VERCEL_ENV`), and each deployment accepts only its own. So
even if the same secret were pasted into both environments by mistake, a
preview's token is still refused by production.

**When this version first goes live**, tokens issued by the previous version
(which had no environment in them) stop working: everyone already signed in
is asked to sign in once more. Nothing else is lost.

Every Vercel deployment counts as production for the server's checks: a
missing or weak secret, a malformed `MONGODB_URI`, or no Blob store stops it
at start-up (the first request gets a 503 and the reason is in the function
log).

### The first preview deployment fails until these are set

That is the fail-closed check doing its job, not a bug. Pushing the branch
before the variables exist gives a deployment whose API answers **503** to
every request (`curl -s -o /dev/null -w '%{http_code}\n' $APP/api/health`
prints `503`), and whose web app may even load as the browser-only build,
because `VITE_USE_API` was missing when it was built. The function log
(Deployments → the deployment → Logs) names the missing variable.

Fix it in this order:

1. Set every variable above, for Preview (and Production).
2. **Redeploy**: Deployments → the failed deployment → ⋯ → **Redeploy**,
   with "Use existing Build Cache" **unticked**. Changed variables only reach
   new deployments, and the `VITE_*` ones are built into the web app, so a
   fresh build is needed. (Pushing a new commit works too.)
3. `curl -s $APP/api/health` now prints `{"ok":true}`.

Rate limits (defaults; change with the `ECOSETU_*_RATE_*` variables in
`server/.env.example`):

| What | Limit | Counted per |
|---|---|---|
| Writes (report, assign, rate, profile, …) | 60 per minute | signed-in user |
| Sign-ups (an account's first sign-in to the API) | 20 per hour (`ECOSETU_SIGNUP_RATE_MAX`) | IP; returning accounts aren't counted |
| New complaints | 10 per hour per user, and 30 per hour per IP | user and IP |
| Toilet ratings (new or changed) | 20 per hour per user, and 60 per hour per IP | user and IP |
| Votes on complaints (set, change or remove) | 60 per hour per user, and 200 per hour per IP | user and IP |
| Sign-in (`/api/auth/firebase`) and other unsigned `/api/auth` calls | 120 per minute | IP |
| Session refresh / logout | 120 per minute | session |
| Demo login | 60 per minute | IP |
| Failed sign-ins (bad or forged tokens) | 30 per 10 minutes | IP |
| Place search / street addresses | 30 per minute per user; Nominatim itself at most 1 per second for the whole app | user |

Signed-in traffic is counted per user so a whole college or hackathon hall on
one public IP isn't blocked. A new account costs little, so sign-ups,
complaints, ratings and votes are **also** counted per IP, with limits sized
for a hall full of people, not one person. For a big event on one network,
raise `ECOSETU_SIGNUP_RATE_MAX` (and the `_IP_` limits) for the day.

## 6. First deployment: wipe, migrate, seed (both databases)

The current database holds demo data only, and records written by earlier
versions lack the user ids that "delete my data" relies on. Start clean, and
do **Preview first** (test the steps there), then **Production**.

1. Atlas → your cluster → Browse Collections → drop the old `ecosetu` database
   (or in mongosh: `use ecosetu` then `db.dropDatabase()`). Only while the data
   is demo data. Once real users exist, never drop it. `ecosetu_preview` is new
   and needs nothing dropped.
2. Deploy, so each environment has run the new version once: the first request
   creates the collections, validators and indexes in its database.
3. On your laptop, in Git Bash, for **Preview**:

   ```bash
   npx vercel@latest link                              # once: choose the project
   npx vercel@latest env pull .env --environment=preview
   grep MONGODB_DB_NAME .env                           # must say ecosetu_preview
   npm run migrate                                     # "Nothing to change" on an empty database
   npm run seed                                        # campus, demo bins/toilets/requests, demo accounts
   rm .env
   ```

   Each script prints the database it used (`Seeded database "ecosetu_preview"`);
   stop if it names the wrong one.
4. The same for **Production**: `--environment=production`, and `grep` must say
   `ecosetu`.

`.env` is git-ignored, but delete it every time: it holds that environment's
secrets.

### If `vercel env pull` leaves the secrets empty

Variables marked **Sensitive** can't be read back, so `env pull` writes them
as empty strings (`MONGODB_URI=""`). The scripts load the same configuration
as the server, and the pulled file sets `VERCEL="1"`, so they apply the
production checks and stop with "… must be set in production".

Give them the values for one run only, typed (or pasted) from your password
manager, without writing them to a file or to your shell history:

```bash
grep -E '^[A-Z0-9_]+=""$' .env | cut -d= -f1            # which values came back empty
(
  for name in MONGODB_URI ECOSETU_JWT_SECRET ECOSETU_JWT_REFRESH_SECRET PHONE_HASH_SECRET; do
    read -rsp "$name: " value; echo                     # -s: nothing is shown on screen
    export "$name=$value"
  done
  npm run migrate && npm run seed
)                                                       # the values vanish with this sub-shell
rm .env
```

- Add to the `for` list any other name the `grep` printed (for example
  `BLOB_READ_WRITE_TOKEN`).
- Values already in your environment take precedence over the `.env` file
  (Node's `--env-file` never overrides them), so the empty lines don't matter.
- Each environment's run uses **that environment's** secrets: the Preview
  run (`--environment=preview`) gets the Preview `PHONE_HASH_SECRET` and JWT
  secrets, the Production run the Production ones. Check the label in your
  password manager before pasting.
- `npm run migrate` **removes the accounts "Continue without account" made**
  (anonymous sign-in, now gone): each one the way "Delete my data" does it,
  so their complaints stay on file anonymised ("Deleted user") and everything
  else of theirs goes. It says how many. Accounts that were saved with an
  email are kept: they log in with that email.
- It also **removes every phone number and phone hash** left by the old phone
  sign-in. Accounts it made keep their uid and role. Roles that were still pending for a phone
  number can't be carried over (a hash can't become an email): the migration
  drops them and says how many; grant them again by email ("Staff accounts", below).
- Lost a secret? `MONGODB_URI`: copy it again from Atlas (reset the user's
  password if needed, then update Vercel). The JWT secrets: generate new ones
  in Vercel for that environment (everyone there is signed out once).
  `PHONE_HASH_SECRET`: don't replace it while that environment has saved
  accounts with roles granted by email; ask me first.
- PowerShell instead of Git Bash: `$s = Read-Host -AsSecureString "MONGODB_URI"`
  then `$env:MONGODB_URI = [Net.NetworkCredential]::new("", $s).Password`
  for each name, run the scripts, and close the window afterwards.

## 7. Check the live deployment

Replace `$APP` with the deployment URL (preview first, then production).

### From a terminal

```bash
curl -s $APP/api/health                                   # {"ok":true}
curl -sI $APP/api/health | grep -iE 'content-security|x-frame|strict-transport|x-content-type'
curl -sI $APP/ | grep -iE 'content-security-policy-report-only|permissions-policy|x-frame'
curl -sI $APP/api/locations/map | grep -i cache-control  # public, max-age=30, s-maxage=30
curl -s -o /dev/null -w '%{http_code}\n' $APP/api/complaints               # 401 (signed in only)
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://evil.example' $APP/api/locations   # 403
curl -s -o /dev/null -w '%{http_code}\n' $APP/api/cron/blob-deletions      # 401 without the secret
```

### Staff accounts (worker, official)

Roles are never chosen in the app. Both kinds are granted to an **email**,
and apply only once Firebase says that email is verified, so nobody can claim
a role by typing someone else's address.

**Officials: `npm run grant-role` (bootstrap).** This is only for creating
officials, starting with the first one:

1. The official opens the app, taps **Create account** with their work
   email, and clicks the link in the verification email.
   (Or grant first: the role waits for the account.)
2. You run, with that environment's secrets (as in section 6):
   `npm run grant-role -- officer@example.org government`. The output shows
   the email masked. `npm run grant-role -- officer@example.org citizen`
   takes the role away again.
3. The role applies at their next sign-in or session refresh.

`grant-role` refuses `worker`: workers are added in the app.

**Workers: only from the Government Official dashboard.** Workers → **Add
worker** with the worker's name and email. That creates a directory entry and
a pending worker role for the email, stored only as a keyed hash and a masked
copy (the dialog shows the masked form of what was typed). When that person
creates an account with the same email and verifies it, they are a Worker.
Removing the worker in the directory takes the role away (they become a
citizen) and cancels a pending invite; restoring brings it back. There is no
other way to become a worker, apart from the demo login.

### In the browser

1. Open the app in a private window: the consent step shows first.
   DevTools → Network shows **no request to the API or Firebase** until
   "Agree and continue", and Firebase → Authentication → Users shows no new
   user. There is no way in without an account (apart from the demo).
2. **Create account** with a real email: the citizen Home opens at once,
   with a "Verify your email" banner; the verification email arrives, and
   after clicking it "I've verified it" removes the banner. Reload: still
   signed in. A wrong password and an unknown
   email give the same message. "Forgot password?" shows the same
   confirmation for any email, and the reset email arrives for a real one.
   Atlas: the user has `emailHash` and `emailMasked`, **no plain address**.
3. As the official (granted with `grant-role`), Workers → **Add worker**
   with a second real email: the card shows the masked email and "Waiting for
   sign-up". Create an account with that email and verify it: it opens the
   Worker dashboard, and the card shows "Account active".
4. Try the demo (if enabled) as citizen, worker and official: each opens its own
   dashboard (Profile → "Reset demo consent" shows the consent screen again
   for a presentation).
5. As a citizen, report an issue **with a photo**; it appears in My
   Complaints and the photo shows on the complaint.
6. As the official, assign it to the demo worker; as the worker, start and
   resolve it with a note. The citizen gets the notifications.
7. Copy the photo's request URL from DevTools → Network (`/api/complaints/…/photo`)
   and open it in a private window: it must be refused. Open it signed in as a
   different citizen: 404.
8. Reload the page while signed in: you stay signed in (one `/api/auth/refresh`
   in the Network tab). Leave the tab hidden for a minute: no requests while
   hidden, one on return.
9. Delete my data (type DELETE and the password; a wrong password deletes
   nothing). The complaint shows "Deleted user" to the
   official, and Firebase → Authentication → Users no longer lists the
   account. Withdraw consent on another account: signed out, data still
   there, consent screen on the next sign-in.
10. Vercel → project → Logs: request lines show only method, path, status,
   time and role — no tokens, emails, passwords or photo data.
11. Vercel → project → Settings → Cron Jobs: run `/api/cron/blob-deletions`
   once; it returns `{"deleted":0,"stillQueued":0}`.

### Content Security Policy (report-only for now)

The site sends `Content-Security-Policy-Report-Only`: the browser reports
anything the policy would block, but blocks nothing yet.

1. Open the app in Chrome or Edge, press **F12** → **Console**. In the filter
   box, type `Content Security Policy` (or `Report Only`).
2. Do every journey once: pan and zoom the map; search a place on the map
   (type a place, press Search); open a view with the embedded OpenStreetMap map;
   create an account and log in to it; use "Forgot password?"; report with a
   photo (camera) and view a complaint photo; use "Try the demo".
3. A violation looks like
   `[Report Only] Refused to load the image 'https://…' because it violates the following Content Security Policy directive: "img-src …"`.
   It names the blocked address and the directive.
4. Send me any such lines (or a screenshot). When a full run shows none, ask
   me to switch the header to enforcing `Content-Security-Policy`.

## 8. Demo login: only around presentations

The labelled demo login ("Try the demo") lets anyone open the citizen, worker
and **official** dashboards without an account. That is what a presentation needs, and
what a public site shouldn't offer the rest of the time. Keep
`DEMO_LOGIN_ENABLED` **unset**, and switch it on only for the event.

**Switch on** (the day before, so there's time to check):

1. Vercel → Settings → Environment Variables → Add `DEMO_LOGIN_ENABLED` =
   `true`, for **Production** (or only Preview, if you present from a preview).
2. Redeploy that environment (Deployments → latest → ⋯ → Redeploy). Variables
   only reach new deployments.
3. Check: the start screen's "Try the demo" link signs in (log out first to
   see the start screen). To show the consent screen,
   use Profile → Privacy and data → **Reset demo consent** before you start.

**Switch off** (straight after):

1. Delete the `DEMO_LOGIN_ENABLED` variable (or set it to `false`).
2. Redeploy. `POST /api/auth/demo` and "Reset demo consent" are gone:
   `curl -s -o /dev/null -w '%{http_code}\n' -X POST $APP/api/auth/demo` prints `404`.
3. Sessions already open as a demo account keep working until they expire
   (up to 7 days). To end them at once: Atlas → Browse Collections →
   `ecosetu` → `refresh_tokens` → filter
   `{ "uid": { "$in": ["demo-citizen", "demo-worker", "demo-official"] } }` →
   delete the matching documents. Open pages then sign out within 15 minutes.

The demo accounts and the demo bins and toilets stay in the database either
way; they are labelled DEMO and can't be signed into while the switch is off.

## 9. If something goes wrong

- **Roll back:** Vercel → Deployments → the previous production deployment →
  "Instant Rollback". The database is shared, so only roll back to a version
  from this same step.
- **Every request returns 503:** the server refused to start. The function
  log says why (a missing variable, Atlas unreachable, no Blob store). On a
  first deployment this is expected until the variables are set (section 5).
- **A preview shows production data, or the reverse:** check `MONGODB_DB_NAME`
  for that environment (section 5), then redeploy.
- **Sign-in fails on a preview** (the app shows "Signing in isn't switched
  on…" or stays on the start screen): add that preview's exact domain to
  Firebase's Authorized domains, and check Email/Password is enabled
  (section 4).
