// Firebase Phone Auth — the identity step of sign-in. Configured through
// VITE_FIREBASE_* env vars (see .env.example). Firebase only proves the phone
// number: the resulting ID token is swapped for the app's own session by
// POST /api/auth/firebase-login (see services/api.js).

import { initializeApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
} from "firebase/auth";

const env = import.meta.env ?? {};
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let auth = null;
let recaptcha = null;
let recaptchaEl = null;
let confirmation = null;

function getFirebaseAuth() {
  if (!firebaseConfigured) {
    throw new Error("Sign-in isn't set up yet. Add the VITE_FIREBASE_* values to .env and restart.");
  }
  if (!auth) auth = getAuth(initializeApp(config));
  return auth;
}

function friendlyError(err) {
  switch (err?.code) {
    case "auth/invalid-phone-number":
      return "That mobile number isn't valid.";
    case "auth/invalid-verification-code":
    case "auth/missing-verification-code":
      return "Incorrect OTP. Please check the code and try again.";
    case "auth/code-expired":
    case "auth/session-expired":
      return "That OTP has expired. Please request a new one.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a while and try again.";
    case "auth/quota-exceeded":
      return "We can't send more OTPs right now. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/captcha-check-failed":
      return "The security (reCAPTCHA) check failed. Refresh the page and try again.";
    case "auth/invalid-app-credential":
      return "This app couldn't be verified with Firebase (invalid app credential). Refresh the page and try again; if it keeps happening, ask the administrator to check the Firebase web app settings.";
    // Problems with the Firebase project itself (not something the user can fix):
    case "auth/operation-not-allowed":
      return "Phone sign-in is turned off for this app. Ask the administrator to enable the Phone provider in Firebase Authentication → Sign-in method.";
    case "auth/configuration-not-found":
      return "Firebase Authentication hasn't been set up for this project yet. Ask the administrator to open Authentication in the Firebase console and enable Phone sign-in.";
    case "auth/unauthorized-domain":
      return "This web address isn't allowed for sign-in. Ask the administrator to add it under Firebase Authentication → Authorized domains.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
      return "The app's Firebase key is not valid. Ask the administrator to check the Firebase settings.";
    case "auth/billing-not-enabled":
      return "SMS can only be sent to your own test numbers until billing is enabled for the Firebase project.";
    case "app/no-recaptcha-container":
      return "The sign-in page didn't load correctly. Refresh the page and try again.";
    default:
      if (err instanceof Error && !err.code) return err.message;
      // Unknown Firebase error: keep the code visible so it can be diagnosed.
      return `Couldn't complete phone verification (${err?.code ?? "unknown error"}). Please try again.`;
  }
}

// Development only: the original Firebase error, so the exact code is visible.
function logFirebaseError(where, err) {
  if (import.meta.env?.DEV) console.error(`[firebase] ${where} failed:`, err?.code ?? "(no code)", "-", err?.message);
}

// The error shown to the user keeps the Firebase code on it (error.code).
function toUserError(where, err) {
  logFirebaseError(where, err);
  return Object.assign(new Error(friendlyError(err)), { code: err?.code ?? null });
}

function clearRecaptcha() {
  try {
    recaptcha?.clear();
  } catch {
    // its container is already gone
  }
  recaptcha = null;
  recaptchaEl = null;
}

// One invisible reCAPTCHA verifier, attached to the rendered container and
// reused while that element is still on the page. It is discarded after any
// failure (and when the page's container changes) so the next attempt gets a
// fresh one.
function getRecaptcha(fbAuth, containerId) {
  const el = document.getElementById(containerId);
  if (!el) {
    throw Object.assign(new Error("recaptcha container is not on the page"), { code: "app/no-recaptcha-container" });
  }
  if (recaptcha && recaptchaEl === el && el.isConnected) return recaptcha;
  clearRecaptcha();
  recaptcha = new RecaptchaVerifier(fbAuth, el, { size: "invisible" });
  recaptchaEl = el;
  return recaptcha;
}

/**
 * Sends an SMS OTP to a 10-digit Indian mobile number. `containerId` is the
 * id of an empty element on the page that hosts the invisible reCAPTCHA.
 */
export async function sendOtp(mobile, containerId = "recaptcha-container") {
  try {
    const fbAuth = getFirebaseAuth();
    const verifier = getRecaptcha(fbAuth, containerId);
    await verifier.render(); // attaches it to the container before use
    confirmation = await signInWithPhoneNumber(fbAuth, `+91${mobile}`, verifier);
  } catch (err) {
    clearRecaptcha();
    throw toUserError("sendOtp", err);
  }
}

/** Confirms the OTP and returns a fresh Firebase ID token for the API. */
export async function confirmOtp(code) {
  if (!confirmation) throw new Error("Your OTP session expired. Please request a new OTP.");
  try {
    const { user } = await confirmation.confirm(code);
    return await user.getIdToken();
  } catch (err) {
    throw toUserError("confirmOtp", err);
  }
}

export async function signOutFirebase() {
  confirmation = null;
  clearRecaptcha();
  if (!firebaseConfigured || !auth) return;
  try {
    await signOut(auth);
  } catch {
    // already signed out
  }
}
