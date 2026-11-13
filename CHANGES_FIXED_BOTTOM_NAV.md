# Fix: bottom navigation scrolled away with the page

## Cause
`.device-frame` only had a `min-height`, so its height grew with the page
content and the *whole document* scrolled. The inner `overflow-y-auto`
area in CitizenShell / WorkerShell never got a chance to scroll, so the
bottom nav (a normal flex child) scrolled off-screen with everything else.

## Fix
Screens with a bottom tab bar now use a fixed-height frame
(`.device-frame--app`): 100dvh on phones, min(900px, viewport - 96px) on
desktop. Only the content area scrolls; the nav stays put.

## Files changed (5)
- src/index.css                      — new `.device-frame--app` modifier
- src/components/CitizenShell.jsx    — uses modifier, `min-h-0` on scroll area
- src/components/WorkerShell.jsx     — same, header `shrink-0`
- src/components/BottomNavigation.jsx — nav `shrink-0`
- src/components/WorkerBottomNav.jsx  — nav `shrink-0`

Auth screens (ScreenShell), Splash and RoleShell are untouched.

## Polish pass (v2)
- Frame now uses almost the full browser height (max 900px) instead of a
  squashed one on short windows.
- Slim, rounded, green-tinted scrollbar inside the frame; no scroll-chaining.
- Extra bottom padding so the last content clears the "+" button.
- Soft shadow on the nav bar to separate it from scrolling content.

## Smartphone proportions (v3)
- On desktop the frame is now a phone-shaped 410 x 864 (~9:19) instead of a
  wide/short box; it scales down with the window height, keeping the ratio
  (width floor 380px). On real phones (<640px) it is still full screen.

## v4
- Fixed stat tiles being cramped in the narrower frame (label ran under the
  chevron): tighter tile spacing, smaller label, frame width floor 400px.
- NEW Eco Guide: the "Small Actions - Make a Big Difference" banner on Citizen
  Home now opens /citizen/eco-guide. Tip of the day, six topics (Segregate,
  Compost, Plastic-free, Save water, Save energy, Go green) each with an SVG
  illustration, steps and a "Did you know?" fact, plus a Report-an-issue
  shortcut. Content lives in src/data/ecoGuide.js. New files:
  src/pages/CitizenEcoGuide.jsx, src/components/EcoIllustration.jsx,
  src/data/ecoGuide.js. Edited: App.jsx, CitizenHome.jsx, StatTile.jsx, index.css.

## v5 — India-wide locations everywhere the app asks "where?"
New shared component `src/components/IndiaLocationPicker.jsx`:
search any city/town/district/state, or browse State -> District -> City/Town
(all 28 states + 8 UTs, 598 districts, 528 cities/towns with coordinates from
data/indiaLocations), plus optional locality/landmark text and a
"Use / pin with GPS" button. Returns { address, latitude, longitude }.
Now used in:
- Citizen Report Issue (was a fixed 6-locality Lucknow list)
- Worker Request Facility -> "Pick on Map"
- Government Add Facility -> "Pick an area"
- Map screen -> "Set area manually"
Lucknow/Meerut localities stay as quick-pick chips. Changed files:
ReportIssue.jsx, WorkerRequestFacility.jsx, GovAddFacility.jsx, MapScreen.jsx.

## v6 — one phone size on every screen
Splash, login/role choice, mobile/OTP/success (ScreenShell) and RoleShell
were still on the old frame. All frames now use `.device-frame--app`:
430px wide, up to 864px tall, content scrolls inside. StatTile labels no
longer split mid-word. Files: index.css, Splash.jsx, ScreenShell.jsx,
RoleShell.jsx, StatTile.jsx. (GovShell is the desktop console with a sidebar
and is intentionally not phone-framed.)
