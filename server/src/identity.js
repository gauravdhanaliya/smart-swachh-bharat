// The only identifying data kept for a saved account: its email address as a
// keyed hash (to find "the account with this email" when an official grants a
// role) and a masked copy (to show the owner which address they saved).
// The address itself is never stored.
//
// The key is PHONE_HASH_SECRET (the variable kept its name from the phone
// sign-in this replaced). A plain SHA-256 of an email would be reversible by
// guessing likely addresses; with a server-side key, a leaked database alone
// reveals nothing.

import crypto from "node:crypto";

export const MIN_IDENTITY_SECRET_LENGTH = 32;

import { maskEmail, normaliseEmail } from "./email.js";

export { maskEmail, normaliseEmail };

/** HMAC-SHA256 of the normalised address, as 64 hex characters. */
export function hashEmail(email, secret) {
  const normal = normaliseEmail(email);
  if (!normal) throw new Error("hashEmail needs an email address.");
  if (typeof secret !== "string" || secret.length < MIN_IDENTITY_SECRET_LENGTH) {
    throw new Error(`PHONE_HASH_SECRET must be at least ${MIN_IDENTITY_SECRET_LENGTH} characters.`);
  }
  return crypto.createHmac("sha256", secret).update(normal).digest("hex");
}
