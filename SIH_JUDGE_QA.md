# SIH Judge Q&A — EcoSetu (Smart Swachh Bharat)

Answers reflect what is actually implemented in the current prototype.
Anything not yet built is explicitly labeled **Future scope**.

---

**1. What problem are you solving?**
Sanitation complaints today move through phone calls, paper registers,
or disconnected apps. Citizens can't track what happens after they
report an issue, officials don't have a live city-wide view, and
workers get instructions with no shared record of what's actually
been resolved.

**2. What is innovative about EcoSetu?**
It isn't three separate apps — it's one shared complaint record that
Citizen, Government, and Worker all read from and write to. When a
government official assigns a worker, that's the exact same record
the citizen is already tracking, updating live for both of them.

**3. How is this different from a normal complaint app?**
A typical complaint app is one-directional: citizen submits, and the
trail often ends there. EcoSetu closes the loop — the same complaint
carries a full status lifecycle (`SUBMITTED → ASSIGNED → IN_PROGRESS →
RESOLVED`) that every role can see change in real time, including the
worker who's expected to act and the citizen waiting for a result.

**4. How does the complaint reach the worker?**
A government official opens the complaint and assigns it to a specific
sanitation worker from a worker directory. That assignment updates the
shared complaint record, so it immediately appears on that worker's
task list with the full complaint details (location, issue type,
description, photo if attached).

**5. How does the citizen track the complaint?**
The Citizen app has a "My Complaints" list and a per-complaint tracking
screen showing a timeline (Submitted → Received by Government →
Assigned to Worker → In Progress → Resolved), reading live from the
same shared complaint store — no refresh-and-hope, no separate status
lookup.

**6. How does role-based access work?**
Each user picks a role at login (Citizen, Government Official, or
Worker). Route guards (`RequireRole`) check the signed-in role before
rendering any screen for that role, so a citizen session can't reach
government/worker screens and vice versa. In this prototype that's a
UI-level guard for demo purposes, not a hardened backend
authorization layer — see Q13/Q11 below for what production-grade
security would add.

**7. How are locations handled?**
The prototype uses a set of preset Lucknow localities (with real
latitude/longitude) for bins, toilets, and complaint locations, shown
on an interactive Leaflet map with free OpenStreetMap tiles. A citizen
picks from these locations (or one carried over from a bin/toilet they
tapped) rather than using live device GPS, since GPS permissions
aren't practical in a judged demo setting.
*Future scope:* live device geolocation and real municipal address/ward
data.

**8. How can this scale to an entire city?**
The complaint data layer is isolated in one module
(`complaintService.js`) that every screen calls through — no screen
talks to `localStorage` directly. Swapping local storage for a real
database/API means changing that module's internals only; the
Citizen/Government/Worker UI and routing don't need to change.
*Future scope:* a real backend, ward/zone-based worker routing, and
pagination for city-scale complaint volumes.

**9. How would IoT integration work in the future?**
The bin-fill percentages shown today are simulated client-side (a
timer nudges each bin's fill level up/down every 20 seconds) to make
the map feel live for a demo — clearly not a real sensor feed.
*Future scope:* replace that simulation with real ultrasonic
fill-level sensors reporting to a backend, which the map/analytics
screens would consume the same way they consume the simulated data
today.

**10. How would real municipal data be integrated?**
The seed data for bins, toilets, workers, and complaints is
structured to mirror what a real API response would look like (an
array of objects with the same field names). Integrating real
municipal data means pointing `complaintService.js` (and the
equivalent bin/toilet data hooks) at real endpoints instead of
seed arrays — the screens consuming that data are already written
against that shape.
*Future scope:* actual integration with a municipal database or GIS
system.

**11. How do you prevent fake/spam complaints?**
Not implemented in this prototype — OTP-based login is demo-only
(a fixed code, no real SMS). *Future scope:* real OTP/SMS
verification tied to a real citizen identity, rate-limiting per
device/number, and photo-based verification before a complaint is
marked resolved.

**12. How is citizen data protected?**
The prototype stores only demo data (a mobile number and complaint
text/photos) locally in the browser's `localStorage` — nothing is
sent to a server, because there is no server in this prototype.
*Future scope:* once a real backend exists, standard protections
(encryption in transit/at rest, access controls, data-retention
policy) would apply, and only what a real deployment needs would be
collected.

**13. What happens if internet connectivity is poor?**
Because complaint data is read from and written to `localStorage`
rather than fetched over the network on every action, the app keeps
working offline once loaded, and a page refresh doesn't lose data.
The map tiles (OpenStreetMap) do need connectivity to load, and the
first page load needs connectivity too. *Future scope:* a full
offline-first mode with background sync once a real backend exists.

**14. What is your future AI/predictive capability?**
None is implemented today — this is explicit future scope, not a
current feature. Plausible directions: predicting which bins are
likely to overflow soon from fill-level history (once real sensor
data exists), or suggesting optimal worker routes based on complaint
density.

**15. How would the government benefit?**
A live dashboard instead of periodic manual reports: total/overflowing
bin counts, complaint volumes and resolution rates, and worker
status — all computed from the same live complaint and bin data the
citizen and worker screens use, so there's no separate reporting
process to maintain.

---

### A note on scope

Everything above that isn't marked "Future scope" is a working
feature you can click through live in the current build — nothing in
this document describes a feature that doesn't exist yet without
saying so.
