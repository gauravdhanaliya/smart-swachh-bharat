// Shared pill-button style tokens.
//
// USABILITY AUDIT FIX (issue 1 — "Many button styles"): controls across
// this app were each hand-rolling their own Tailwind class string, and
// three different color systems had crept in side by side — emerald,
// sky, and slate — for what are functionally the same two states
// (active/selected vs. inactive/secondary). Centralizing those two
// states here means every pill-shaped control can share one visual
// language instead of inventing a new one.
export const PILL = "rounded-lg px-3 py-1.5 text-xs font-semibold transition";
export const PILL_ACTIVE = `${PILL} bg-brand text-white`;
export const PILL_INACTIVE = `${PILL} bg-white text-ink border border-line hover:bg-section`;

// USABILITY AUDIT FIX (issue 1, round 2): LocationCard's "me" variant had
// its own one-off "Open ... in Google Maps" button in bg-sky-700 — a
// leftover blue that never got folded into the emerald-only cleanup, and
// a genuine duplicate of the ring-style ghost button already used twice
// elsewhere in the same file. One shared token now backs all three.
export const GHOST_RING =
  "rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand ring-1 ring-line";

// USABILITY AUDIT FIX (issue 3): "View all" / "Show less" were bare text
// with no padding (~16px tall — well under the ~44px touch-target
// minimum). min-h-[44px] guarantees the tap target regardless of font
// metrics, rather than approximating it with padding alone.
//
// ROUND 2 (issues 1 + 5): bumped text-xs -> text-sm so the token is
// legible as an action (not just tappable), and it now also backs the
// Citizen Home "Lucknow" city picker and "See full map" link — two
// controls that were hand-rolling their own bare-text styles. Callers
// that want an inline arrow just add `gap-1`.
export const TAP_LINK =
  "inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-brand hover:text-brand-hover";

// USABILITY AUDIT FIX (round 2, issues 1 + 4): the Citizen Home screen
// had three near-identical "card that is really a button" styles (Total
// Bins p-4, StatTile p-3.5, sheet actions px-4 py-3 with no background)
// plus a filled banner that differed only in colour and padding. Every
// card-shaped control now shares one radius / padding / border / shadow /
// hover / focus treatment; the filled variant only swaps the colours.
// Pair either one with a trailing chevron so it reads as tappable.
const CARD =
  "flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
export const CARD_BUTTON = `${CARD} border border-line bg-white hover:bg-section`;
export const CARD_BUTTON_FILLED = `${CARD} border border-brand bg-brand text-white hover:bg-brand-hover`;

// Bottom-nav items (including the centre Quick Actions button) share one
// class string so they compute to a single button style.
export const NAV_ITEM = "flex flex-1 flex-col items-center gap-1 py-2";
