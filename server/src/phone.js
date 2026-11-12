// Phone numbers are never stored. A user record keeps:
//   phoneHash   HMAC-SHA256 of the 10 digit number, keyed with PHONE_HASH_SECRET.
//               A plain SHA-256 would be useless: there are only ~4 billion
//               Indian mobile numbers, so every hash could be reversed in
//               minutes. With a server-side key, a leaked database alone
//               reveals nothing.
//   phoneMasked "+91 98XXXXXX10", for display.
// The hash is only used to find "the user with this number" (grant-role, and
// the one-account-per-number check).

import crypto from "node:crypto";

export const MIN_PHONE_SECRET_LENGTH = 32;

/** Accepts "9876543210", "+91 98765 43210", "09876543210"…; returns the 10 digits or null. */
export function normalisePhone(input) {
  const digits = String(input ?? "").replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

/** HMAC-SHA256 of a 10 digit number, as 64 hex characters. */
export function hashPhone(phone, secret) {
  if (typeof phone !== "string" || !/^\d{10}$/.test(phone)) throw new Error("hashPhone needs a 10 digit number.");
  if (typeof secret !== "string" || secret.length < MIN_PHONE_SECRET_LENGTH) {
    throw new Error(`PHONE_HASH_SECRET must be at least ${MIN_PHONE_SECRET_LENGTH} characters.`);
  }
  return crypto.createHmac("sha256", secret).update(phone).digest("hex");
}

/** "9876543210" -> "+91 98XXXXXX10" */
export function maskPhone(phone) {
  return `+91 ${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}`;
}
