# Usability round 2 — change log

Page audited: /citizen (5 issues), plus the follow-up fix for the bell and city picker.

## Audit issues
1. **Many button styles** — new shared tokens in `src/components/buttonStyles.js`: `CARD_BUTTON`, `CARD_BUTTON_FILLED`, `NAV_ITEM`; `TAP_LINK` reused (now `text-sm`).
2. **Quick Actions sheet overlapped nav** — sheet anchored above the nav bar (`BottomNavigation.jsx`); Leaflet map wrapper isolated (`isolate`) so it can't paint through overlays.
3. **Cluttered emoji markers** — clustering, SVG icons and a compact dot mode in `FacilityMap.jsx`; legend chip in `MapPreview.jsx`.
4. **Stat cards not obviously clickable** — trailing chevron + hover/focus in `StatTile.jsx`; copy "Bins Need Collection".
5. **"See full map" too small** — uses `TAP_LINK` with arrow, header spacing (`CitizenHome.jsx`).

## Follow-up: bell + city picker
- Notifications screen: `src/pages/CitizenNotifications.jsx`, route `/citizen/notifications`, feed in `src/utils/citizenNotifications.js`, unread tracking in `src/hooks/useCitizenNotifications.js`.
- City picker: `src/components/CitySelector.jsx`, `src/hooks/useCity.js`, `src/data/cities.js`. Home counts and preview map follow the chosen city; demo data only covers Lucknow.

## Known gaps
- Full map screen ("View on map") is not city-aware yet.
- "Small Actions" banner has no click action.

## Step 14E — Remove Facility (mirror of Add Facility)

Government can now take a dustbin or public toilet **off** the map, not just add one.

- `src/services/facilityService.js` — new `removeFacility()`, `restoreFacility()`,
  `restoreAllFacilities()`, `getRemovedFacilities()`, `isFacilityRemoved()` and
  `REMOVAL_REASONS`. Removals are stored as a **tombstone list**
  (`ssb_removed_facilities_v1`) rather than by mutating the source arrays, because a
  facility can originate from three places — the static demo seed, Government-added
  localStorage, or a derived approved Worker request — and only one of those is
  writable. `getAllBins()` / `getAllToilets()` filter the tombstoned ids out, so a
  removal propagates to every screen that already reads them: Government Bins &
  Public Toilets, the Government dashboard counts, and the Citizen Bin & Toilet Map.
  `resetDemoData()` now clears removals too.
- `src/hooks/useFacilityRemoval.js` — shared remove-mode / confirm / undo state so the
  Bins and Public Toilets pages behave identically.
- `src/components/RemoveFacilityDialog.jsx` — confirm step with a recorded reason.
- `src/components/RemovedFacilitiesPanel.jsx` — Undo bar (10s) plus a collapsed audit
  list of everything removed, each row restorable.
- `src/pages/government/GovBins.jsx`, `GovToilets.jsx` — "− Remove Facility" header
  button next to "+ Add Facility"; it toggles remove mode, which reveals a Remove
  button on each card. Also added an empty state when a filter matches nothing.
- `src/components/GovShell.jsx` — mobile action bar wraps now that pages pass two
  header actions.

Removal is always reversible, which matters during a live demo: a wrong click never
permanently breaks the seeded dataset.

## Step 14F — Citizen Profile: theme, help & support, preferences

The Citizen Profile was a flat stack of four unrelated controls. It's now grouped
into labelled sections, and the settings a civic app is expected to have are real
(persisted and wired to behaviour) rather than placeholders.

**Night mode (app-wide)**
- `src/context/ThemeContext.jsx` — Light / Dark / System, persisted to `ssb_theme_v1`,
  follows the OS setting live while System is selected, and keeps the
  `<meta name="theme-color">` in step.
- `index.html` — a pre-paint script applies the saved theme (and Reduce motion) before
  React mounts, so a dark-mode device never flashes white.
- `src/index.css` — the palette. Every screen hard-codes emerald/slate utilities, and
  Tailwind v4 compiles those to `var(--color-*)`, so the ramps are **inverted** under
  `html.dark` and the whole app re-themes at once — including hover/focus/placeholder
  variants and opacity modifiers like `text-emerald-800/60`, which per-class overrides
  could never reach. A handful of shades serve double duty (`bg-emerald-700` button vs
  `text-emerald-700` label); those get explicit `bg-*`/`border-*` overrides restoring
  the saturated colour. Leaflet tiles and the OSM iframe are inverted+hue-rotated so
  maps match. **Add new solid-colour buttons in a dark shade to that override list.**

**New Help & Support page** (`src/pages/CitizenHelp.jsx`, route `/citizen/help`)
- Common tasks, contact rows (Swachh Bharat Mission helpline 1969 is real; the control
  room and email are labelled as demo placeholders), the four-stage complaint lifecycle
  read from `STATUS_ORDER`, an 8-item FAQ written against what the app actually does,
  and an About section that discloses this is a prototype storing data on-device.

**Working preferences** (`src/hooks/useCitizenPreferences.js`, `ssb_citizen_prefs_v1`)
- *Complaint updates* / *Resolution alerts* filter the feed in
  `utils/citizenNotifications.js`, so switching one off removes those entries from the
  notifications list **and** from the Home bell badge.
- *Reduce motion* disables the app's entrance animations via a `reduce-motion` class.
- Home city moved onto the Profile as well, sharing `useCity`.

**Also on the Profile**
- Three-up stats (Complaints / Open / Resolved), the first tappable through to the list.
- Notifications row with an unread badge.
- Logout now asks for confirmation instead of firing on a single tap.
- New shared components: `SettingsGroup`, `ToggleSwitch` (real `role="switch"`),
  `SegmentedControl`.

Known gap: the theme applies to the Worker and Government consoles too, but can only be
changed from the Citizen profile — those two need their own Appearance card.

## Step 14G — Light by default, no in-app motion toggle, custom locations

- **Theme default is now Light**, not System. `readStoredTheme()` in
  `src/context/ThemeContext.jsx` and the bootstrap script in `index.html` both fall
  back to light, so an unset preference is never dark — a first-run user always sees
  the white/green Swachh Bharat palette. Dark and System stay available in
  Profile → Appearance.
- **Removed the Accessibility group** and the `reduceMotion` preference (hook, CSS
  class and bootstrap script). `@media (prefers-reduced-motion: reduce)` stays in
  `src/index.css` — the browser already owns that preference, so duplicating it as an
  app switch was redundant.
- **Custom locations.** `src/services/cityService.js` (new, `ssb_custom_cities_v1`)
  merges citizen-added places into the six built-ins from `data/cities.js`;
  `useCity` now subscribes to it and exposes `addLocation` / `removeLocation`, so a
  location added on the Profile appears in the Home picker without a reload.
  `src/components/AddLocationDialog.jsx` takes a name, an optional state/district, and
  coordinates either from GPS (`useLiveLocation`, with its approximate-fix warning) or
  typed in by hand, with a `SimpleMap` preview as the confirmation step. Custom entries
  are removable from both the Home dropdown and the Profile; built-in cities aren't,
  since the demo dataset is anchored to them.

## Step 14H — Dark mode removed

Dark mode (and the theme picker built for it) has been removed entirely, per request.
The app is light-only again, matching the Swachh Bharat brand identity.

- Deleted `src/context/ThemeContext.jsx` (theme state) and `src/components/SegmentedControl.jsx`
  (only ever used for the Light/Dark/System picker).
- `src/App.jsx` — dropped the `ThemeProvider` wrap.
- `src/pages/Profile.jsx` — removed the "Appearance" section, the `THEME_OPTIONS` array and the
  `useTheme` call; the Demo Tools blurb no longer promises to keep theme settings.
- `index.html` — removed the pre-paint dark-detection bootstrap script.
- `src/index.css` — deleted the entire `html.dark` night-mode block (palette inversion, button
  overrides, map filter, scrim, shadow fix — everything added in Step 14F/14G). The
  `@media (prefers-reduced-motion: reduce)` rule (unrelated to theme) was kept.
- `src/components/SimpleMap.jsx` — dropped the now-unused `ssb-osm-frame` class that existed only
  to let dark mode invert the map tiles.
- Any `ssb_theme_v1` value left in a browser's localStorage from testing earlier builds is now
  simply ignored — nothing reads that key anymore.

## Step 14I — "Demo Mode · Prototype Data" badge removed

Removed everywhere it appeared, and the component itself is deleted:

- `src/components/GovShell.jsx` — sidebar footer (the one in the screenshot, above
  "Cleaner Cities / Greener Tomorrow").
- `src/components/WorkerShell.jsx` — header eyebrow row, next to "EcoSetu · Smart
  Swachh Bharat".
- `src/pages/MapScreen.jsx` — top-right of the Bin & Toilet Map header. Replaced with a
  plain `w-9` spacer (no visible content) so the centered title stays balanced against
  the back button on the left, rather than drifting off-center.
- `src/pages/Splash.jsx` — under the tagline on the splash screen.
- Deleted `src/components/DemoModeBadge.jsx` and the stale comment in `src/data/bins.js`
  that pointed to it.

Nothing else referenced the badge, so the app no longer discloses in-UI that its data
is simulated. `README.md` / `SIH_DEMO_GUIDE.md` still document that separately if you
want that disclosure to live somewhere.

## Step 14J — Government profile is now editable (defaults to Meerut)

"District Officer" / "Lucknow District" was hard-coded in three separate files. It's
now one editable identity, defaulting to **Meerut**, changeable anytime from the
Government Profile page.

- `src/services/govProfileService.js` (new, `ssb_gov_profile_v1`) — `{ name, district,
  ministry }`, default `{ "District Officer", "Meerut", "Ministry of Housing & Urban
  Affairs" }`. `JURISDICTION_OPTIONS` reuses the six districts from `data/cities.js` so
  picking one also gives `getGovJurisdictionCenter()` real coordinates.
- `src/hooks/useGovProfile.js` (new) — subscribes to the store; `govInitials(name)`
  derives the avatar initials from whatever name is set (no longer a hard-coded "DO").
- `src/pages/government/GovProfile.jsx` — added an **Edit profile** button that turns
  the card into a form (name/title, a jurisdiction dropdown, department). Saves
  immediately and persists.
- `src/components/GovShell.jsx` — the header profile chip (avatar + name + district)
  now reads from the store instead of being hard-coded.
- `src/pages/government/GovDashboard.jsx` — the subtitle now reads `"…— {district}
  District"`, and the dashboard's default map view re-centres on the officer's chosen
  district's coordinates (falls back to the old Lucknow point only if a district has no
  match).
- `src/hooks/useFacilityRemoval.js` — a facility-removal audit record's "removed by"
  now uses the configured officer name instead of a fixed string.

Reset Demo Data does **not** touch this — it's identity, not demo content, so it
survives a reset the same way alert preferences do on the Citizen side.
