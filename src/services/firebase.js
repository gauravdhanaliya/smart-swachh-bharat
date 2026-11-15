// Firebase app + Auth: email + password accounts (no anonymous sign-in).
//
// The config comes from VITE_FIREBASE_* variables (see .env.example). These
// are the public web config values, not secrets — access is controlled by the
// Firebase console (authorized domains, sign-in providers), not by hiding them.
//
// Nothing is initialized until getFirebaseAuth() is first called, and this
// module is only loaded on demand by authService.js.

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

const REQUIRED = ["apiKey", "authDomain", "projectId", "appId"];

export function isFirebaseConfigured() {
  return REQUIRED.every((key) => typeof firebaseConfig[key] === "string" && firebaseConfig[key].trim() !== "");
}

export function getFirebaseAuth() {
  if (!isFirebaseConfigured()) {
    const error = new Error("Firebase is not configured. Set the VITE_FIREBASE_* variables.");
    error.code = "auth/not-configured";
    throw error;
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  auth.languageCode = "en";
  return auth;
}
