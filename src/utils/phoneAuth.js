// Pure helpers for phone OTP login: validation, masking and error text.
// Indian mobile numbers only — the +91 prefix is fixed, so `phone` here is
// always the 10 digit national number as a string.

const PHONE_RE = /^[6-9]\d{9}$/;
const OTP_RE = /^\d{6}$/;

export const COUNTRY_CODE = "+91";
export const PHONE_LENGTH = 10;
export const OTP_LENGTH = 6;

const PHONE_ERROR = "Enter a valid 10 digit mobile number starting with 6, 7, 8 or 9.";
const OTP_ERROR = "Enter the 6 digit OTP.";

export function validatePhone(phone) {
  const ok = typeof phone === "string" && PHONE_RE.test(phone);
  return { ok, error: ok ? "" : PHONE_ERROR };
}

export function validateOtp(code) {
  const ok = typeof code === "string" && OTP_RE.test(code);
  return { ok, error: ok ? "" : OTP_ERROR };
}

/** "9876543210" -> "+919876543210" (what Firebase expects). */
export function toE164(phone) {
  return `${COUNTRY_CODE}${phone}`;
}

/** "9876543210" -> "+91 98XXXXXX10". Empty string for an invalid number. */
export function maskPhone(phone) {
  if (!validatePhone(phone).ok) return "";
  return `${COUNTRY_CODE} ${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}`;
}

/** Keeps only digits, capped at `max` — used by the phone and OTP inputs. */
export function digitsOnly(value, max) {
  return String(value ?? "").replace(/\D/g, "").slice(0, max);
}

const ERROR_MESSAGES = {
  "auth/invalid-phone-number": PHONE_ERROR,
  "auth/missing-phone-number": PHONE_ERROR,
  "auth/invalid-verification-code": "That OTP is incorrect. Check the code and try again.",
  "auth/missing-verification-code": OTP_ERROR,
  "auth/code-expired": "This OTP has expired. Tap Resend OTP to get a new one.",
  "auth/too-many-requests": "Too many attempts. Please wait a while before trying again.",
  "auth/quota-exceeded": "Too many attempts. Please wait a while before trying again.",
  "auth/network-request-failed": "Network problem. Check your internet connection and try again.",
  "auth/captcha-check-failed": "Security check failed. Please try again.",
  "auth/not-configured": "Phone login is not set up on this build yet. Use “Try the demo” below.",
  "auth/user-mismatch": "That number isn't the one this account signed in with. Use the same number.",
  "auth/requires-recent-login": "For your security, Firebase needs a fresh code. Send a new code and enter it.",
};

/** A user-facing message for a Firebase (or authService) error. */
export function authErrorMessage(error) {
  return ERROR_MESSAGES[error?.code] ?? "Something went wrong. Please try again.";
}
