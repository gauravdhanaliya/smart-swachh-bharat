// Firebase ID-token verification. Sign-in happens in the browser (an
// anonymous account, or one saved with email + password); the API only ever
// sees the resulting ID token.
//
// Uses `jose` rather than firebase-admin: verifying a token needs nothing but
// Google's public signing keys, and jose is a small dependency with no
// credentials or service account involved. Checked on every token: RS256
// signature against Google's keys, issuer, audience, expiry and subject.

import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/**
 * Returns async (idToken) => { uid, provider, email, emailVerified } and
 * throws on any invalid token. `provider` is Firebase's sign_in_provider
 * ("anonymous", "password", "phone"…); `email` is null unless the token has one.
 * `keys` is only overridden in tests (a local JWKS stands in for Google's).
 */
export function createFirebaseVerifier(projectId, { keys = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)) } = {}) {
  return async (idToken) => {
    const { payload } = await jwtVerify(idToken, keys, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) {
      throw new Error("Token has no subject.");
    }
    const provider = typeof payload.firebase?.sign_in_provider === "string" ? payload.firebase.sign_in_provider : "";
    return {
      uid: payload.sub,
      provider,
      email: typeof payload.email === "string" && payload.email ? payload.email : null,
      emailVerified: payload.email_verified === true,
    };
  };
}
