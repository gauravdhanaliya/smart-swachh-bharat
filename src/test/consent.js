// Marks the privacy notice as accepted for a user in the browser-only build,
// so tests that aren't about the consent screen go straight to the page.
import { CONSENT_ITEMS, DEFAULT_CONSENT_VERSION } from "../../server/src/constants.js";

export const LOCAL_CONSENT_KEY = "ssb_consent_v1";

export function acceptConsentLocally(user, version = DEFAULT_CONSENT_VERSION) {
  let all = {};
  try {
    all = JSON.parse(localStorage.getItem(LOCAL_CONSENT_KEY)) ?? {};
  } catch {
    all = {};
  }
  all[user.id] = { version, acceptedAt: new Date().toISOString(), items: Object.fromEntries(CONSENT_ITEMS.map((k) => [k, true])) };
  localStorage.setItem(LOCAL_CONSENT_KEY, JSON.stringify(all));
}

/**
 * The agreement given on the start screen before signing in (consentService
 * deviceConsent). Set before every test (setup.js): tests that aren't about
 * the first visit start past the consent step. First-visit tests clear it.
 */
export function agreeOnThisDevice() {
  localStorage.setItem(
    "ssb_device_consent_v1",
    JSON.stringify({ version: DEFAULT_CONSENT_VERSION, items: Object.fromEntries(CONSENT_ITEMS.map((k) => [k, true])), acceptedAt: new Date().toISOString() })
  );
}

/** A first visit: nothing agreed on this device yet. */
export function firstVisit() {
  localStorage.removeItem("ssb_device_consent_v1");
}

/** Accepted for every demo account and the given user ids (tests not about consent). */
export function acceptConsentForAll(...userIds) {
  for (const id of ["demo-citizen", "w1", "demo-official", ...userIds]) acceptConsentLocally({ id });
}
