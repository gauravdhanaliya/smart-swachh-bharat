// Phone OTP sign-in through Firebase Authentication.
//
// This is the only module that talks to Firebase, so screens and tests can
// mock it. The pending confirmation and the reCAPTCHA verifier live in module
// memory only — neither the OTP nor the confirmation object is ever written
// to storage. Firebase is loaded on demand, so the demo login never pays for it.

import { toE164, validateOtp, validatePhone } from "../utils/phoneAuth";

export const RECAPTCHA_CONTAINER_ID = "recaptcha-container";

let verifier = null;
let confirmation = null;

function authError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function clearVerifier() {
  try {
    verifier?.clear();
  } catch {
    // already gone
  }
  verifier = null;
}

/** Forgets any OTP request in progress (used when the user changes number). */
export function resetPendingOtp() {
  confirmation = null;
  clearVerifier();
}

// A fresh element per attempt: reCAPTCHA refuses to render twice in one node.
function recaptchaMount(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return containerId;
  container.replaceChildren();
  return container.appendChild(document.createElement("div"));
}

/** Sends an OTP to the 10 digit Indian number. Rejects with an error that has a `code`. */
export async function sendOtp(phone, containerId = RECAPTCHA_CONTAINER_ID) {
  if (!validatePhone(phone).ok) throw authError("auth/invalid-phone-number");

  const { getFirebaseAuth, isFirebaseConfigured } = await import("./firebase");
  if (!isFirebaseConfigured()) throw authError("auth/not-configured");
  const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");

  resetPendingOtp();
  const auth = getFirebaseAuth();
  verifier = new RecaptchaVerifier(auth, recaptchaMount(containerId), { size: "invisible" });
  try {
    confirmation = await signInWithPhoneNumber(auth, toE164(phone), verifier);
  } catch (error) {
    clearVerifier();
    throw error;
  }
}

/**
 * Checks the OTP for the last sendOtp(). Resolves to `{ uid, idToken }`: the
 * Firebase ID token is what the EcoSetu API verifies at sign-in. Neither is
 * stored; the caller hands the token straight to the server.
 */
export async function confirmOtp(code) {
  if (!validateOtp(code).ok) throw authError("auth/invalid-verification-code");
  if (!confirmation) throw authError("auth/code-expired");

  const credential = await confirmation.confirm(code);
  resetPendingOtp();
  const idToken = typeof credential.user.getIdToken === "function" ? await credential.user.getIdToken() : null;
  return { uid: credential.user.uid, idToken };
}

// ---- deleting the Firebase sign-in ("delete my data") ----------------------
//
// Firebase only deletes an account that signed in recently, so the user
// confirms a fresh OTP first, then user.delete() runs on this device. If the
// device still holds the Firebase sign-in, it is re-verified
// (reauthenticateWithPhoneNumber); otherwise the number signs in again and the
// account must be the same one (its uid is the app's user id).

let deleteConfirmation = null;

/** Whether this build has Firebase phone sign-in at all (no account to delete otherwise). */
export async function firebaseDeletionAvailable() {
  const { isFirebaseConfigured } = await import("./firebase");
  return isFirebaseConfigured();
}

/** Sends the OTP that confirms deleting the Firebase sign-in. */
export async function sendDeleteOtp(phone, containerId = RECAPTCHA_CONTAINER_ID) {
  if (!validatePhone(phone).ok) throw authError("auth/invalid-phone-number");
  const { getFirebaseAuth, isFirebaseConfigured } = await import("./firebase");
  if (!isFirebaseConfigured()) throw authError("auth/not-configured");
  const { RecaptchaVerifier, reauthenticateWithPhoneNumber, signInWithPhoneNumber } = await import("firebase/auth");

  resetPendingOtp();
  deleteConfirmation = null;
  const auth = getFirebaseAuth();
  verifier = new RecaptchaVerifier(auth, recaptchaMount(containerId), { size: "invisible" });
  try {
    deleteConfirmation = auth.currentUser
      ? await reauthenticateWithPhoneNumber(auth.currentUser, toE164(phone), verifier)
      : await signInWithPhoneNumber(auth, toE164(phone), verifier);
  } catch (error) {
    clearVerifier();
    throw error;
  }
}

/**
 * Checks the code, then deletes the Firebase account with user.delete().
 * Rejects with a `code`: "auth/user-mismatch" if the number belongs to another
 * account (nothing deleted, that sign-in ended), "auth/requires-recent-login"
 * if Firebase still wants a fresher sign-in (send a new code and try again).
 */
export async function confirmDeleteOtp(code, { expectedUid }) {
  if (!validateOtp(code).ok) throw authError("auth/invalid-verification-code");
  const pending = deleteConfirmation;
  if (!pending) throw authError("auth/code-expired");
  const credential = await pending.confirm(code);
  deleteConfirmation = null; // a code works once; a retry needs a new one
  clearVerifier();
  const user = credential.user;
  if (expectedUid && user.uid !== expectedUid) {
    await signOutUser();
    throw authError("auth/user-mismatch");
  }
  await user.delete();
}

/** Signs out of Firebase. Never rejects, so logout always completes locally. */
export async function signOutUser() {
  resetPendingOtp();
  try {
    const { getFirebaseAuth, isFirebaseConfigured } = await import("./firebase");
    if (!isFirebaseConfigured()) return;
    const { signOut } = await import("firebase/auth");
    await signOut(getFirebaseAuth());
  } catch {
    // offline or already signed out — the local session is cleared regardless
  }
}
