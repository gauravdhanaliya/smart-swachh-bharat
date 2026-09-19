# SIH Demo Guide — EcoSetu (Smart Swachh Bharat)

A 3–5 minute live demonstration script for judges, plus supporting
talking points and a plain-language architecture explanation.

Before you start: open the Citizen or Government Profile screen and
tap **Reset Demo Data** so the walkthrough begins from the same known
state every time.

Login for every role: choose the role on the login screen → enter any
10-digit mobile number → OTP `123456` (clearly labeled on-screen as
demo mode — no real SMS is sent).

---

## A. Introduction (≈30 seconds)

> "This is EcoSetu — Smart Swachh Bharat. It's a single platform that
> connects three people who today usually can't see each other's side
> of a sanitation complaint: the citizen who reports a problem, the
> government official who has to manage it city-wide, and the worker
> who actually resolves it. One complaint, one shared record, visible
> to all three in real time."

## B. Citizen demonstration (≈45 seconds)

1. Log in as **Citizen**.
2. From the Citizen Dashboard, open **Find Bin** (the bin map).
3. Select an overflowing bin (or narrate: "here's a bin flagged as
   overflowing").
4. Tap **Report Issue** — note it opens pre-filled with the issue type
   and location carried over from the bin you selected.
5. Submit the complaint.

**Show on screen:**
- Complaint ID: `SSB2026-0048`
- Issue: Overflowing Bin
- Location: Gomti Nagar, Lucknow
- Description: *"Bin is overflowing and waste is spreading around the
  area."*

> "This complaint already exists as seed data at exactly this ID and
> status, so if a submission doesn't go through live for any reason,
> the same complaint is right there to continue the demo from."

## C. Government demonstration (≈45 seconds)

1. Log out, log back in as **Government Official**.
2. Open the **Dashboard** — point out the new complaint appearing in
   the recent-complaints list / total-complaints count.
3. Open complaint `SSB2026-0048`.
4. **Assign Worker** → select **Vikash Kumar**.

> "The official sees this complaint the moment it's submitted — same
> ID, same location, same description the citizen typed — and assigns
> it to a specific sanitation worker in one action."

## D. Worker demonstration (≈45 seconds)

1. Log out, log back in as **Sanitation Worker** (defaults to Vikash
   Kumar, the worker just assigned).
2. Open **My Tasks** → open `SSB2026-0048`.
3. Tap **Start Work**.

> "Vikash now sees this on his task list, with the same complaint
> details the citizen originally submitted — no re-entry, no phone
> calls needed to relay the address."

## E. Resolution tracking (≈45 seconds)

1. Log out, log back in as **Citizen**.
2. Open **My Complaints** → show status: **IN PROGRESS**.
3. Log out, log back in as **Worker**.
4. Tap **Mark as Resolved**, enter the resolution note:
   *"Waste cleared and surrounding area cleaned."*
5. Log out, log back in as **Citizen** → show status: **RESOLVED**.
6. Log out, log back in as **Government Official** → show the same
   complaint as **RESOLVED** on the dashboard/complaints list.

> "The same complaint ID moved through Submitted → Assigned → In
> Progress → Resolved, and every role saw the update the moment it
> happened — no separate systems, no lost paperwork."

## F. Closing impact statement (≈20 seconds)

> "Today, sanitation complaints in most cities die somewhere between a
> phone call and a paper register. EcoSetu makes the full lifecycle of
> a complaint — citizen to government to worker and back — visible,
> traceable, and accountable, on a platform any municipality could
> stand up quickly."

**Total: ~3.5–4 minutes**, with room to answer a question or two
inside the 5-minute window.

---

## Judge talking points

**Problem** — Citizens have no reliable way to report sanitation
issues and track what happens next; officials lack a live, city-wide
view of complaints and worker assignments; workers get instructions
informally, with no record of what was actually resolved.

**Solution** — One shared complaint record that all three roles read
and write to, with clear statuses (`SUBMITTED → ASSIGNED → IN_PROGRESS
→ RESOLVED`) that update live for everyone watching that complaint.

**Innovation** — Not three separate apps stitched together, but one
codebase where a single complaint object is the source of truth for
all three roles — the worker assignment a government official makes
is the exact same record the citizen is tracking and the worker is
acting on.

**Technology** — React 19 + Vite frontend, React Router for
role-based routing/guards, Tailwind CSS for the UI, Leaflet with free
OpenStreetMap tiles for the bin/toilet maps — no paid map API keys.

**Impact** — Removes the communication gap between citizen reports and
municipal action, and gives officials a live operational view (bin
fill-levels, complaint volumes, worker status) instead of end-of-week
reports.

**Scalability** — The data layer is already isolated behind one
module (`complaintService.js`); swapping `localStorage` for a real
API/database means changing that one file's internals, not any of the
citizen/government/worker screens that call it.

**Feasibility** — Built entirely on free, open technology (no paid
map API, no paid backend), so a municipality can deploy it on standard
low-cost static hosting with no licensing overhead.

**Future scope** — Real backend + database, real SMS/OTP gateway,
live IoT bin-fill sensors, and analytics for predicting collection
routes (see `SIH_JUDGE_QA.md` for how these would be phased in).

---

## Technical explanation (architecture)

```
Citizen UI  /  Government UI  /  Worker UI      (React components, role-specific screens)
        ↓
Role-based application logic                     (React Router + RequireRole route guards)
        ↓
Complaint management                             (createComplaint / assignComplaint /
                                                    updateComplaintStatus — complaintService.js)
        ↓
Shared data/state                                (single complaint record, subscribed to by
                                                    all three roles via useComplaints())
        ↓
Location + facility data                         (seed bin/toilet/location data — src/data/)
        ↓
Status tracking                                  (SUBMITTED → ASSIGNED → IN_PROGRESS → RESOLVED)
        ↓
Resolution                                        (worker resolution note/photo, visible to
                                                    citizen and government immediately)
```

This reflects what is actually implemented today: React 19, Vite,
React Router v7, Tailwind CSS v4, Leaflet/React-Leaflet, and
`localStorage` as the prototype's persistence layer. There is no
backend server, database, SMS gateway, or AI component in the current
build — those are future scope, called out explicitly as such in
`SIH_JUDGE_QA.md`.
