// Shared by the account forms (AccountSection, EmailAccountSheet). Kept out of
// the component files so React Fast Refresh keeps working on them.
import { accountErrorMessage } from "../utils/accountErrors";

// Inputs and buttons: 48px tall, 12px radius (no pills); one brand green.
export const INPUT =
  "mt-1.5 h-12 w-full rounded-xl border border-emerald-200 bg-white px-4 text-base text-ink placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none";
export const PRIMARY =
  "mt-4 h-12 w-full cursor-pointer rounded-xl bg-brand px-4 text-base font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none btn-disabled";
// The outlined secondary button (e.g. "Try the demo").
export const SECONDARY =
  "h-12 w-full cursor-pointer rounded-xl border border-line bg-white px-4 text-base font-semibold text-ink transition-colors hover:bg-section focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none btn-disabled-quiet";
// Links: plain brand-green text, no; 44px tap height.
export const LINK =
  "inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-brand hover:text-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

// A Firebase error (with a code) in words; the API's own message otherwise.
export const messageFor = (err) => (err?.code ? accountErrorMessage(err) : err?.message || accountErrorMessage(err));
