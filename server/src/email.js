// Email helpers with no secrets and no Node built-ins, so the browser can use
// them too (the browser-only build validates with the same code). The keyed
// hash lives in identity.js, server-side only.

// Deliberately loose: Firebase has already accepted the address; this only
// rejects things that can't be an email at all.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

/** Trimmed and lowercased, or null if it can't be an email address. */
export function normaliseEmail(input) {
  const email = String(input ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/** "asha.verma@example.test" -> "as***@e***.test" (enough for the owner to recognise it). */
export function maskEmail(email) {
  const normal = normaliseEmail(email);
  if (!normal) return null;
  const [local, domain] = normal.split("@");
  const dot = domain.lastIndexOf(".");
  const name = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);
  return `${local.slice(0, Math.min(2, local.length - 1) || 1)}***@${name[0]}***.${tld}`;
}
