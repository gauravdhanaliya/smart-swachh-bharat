// User-facing messages for Firebase sign-in errors (email accounts). Every message says what to do next, and none of them says
// whether an email address has an account.

const NEUTRAL_NOT_CREATED =
  "We couldn't use that email for a new account. If you already have one, log in or reset your password.";

const MESSAGES = {
  "auth/not-configured": "Accounts aren't set up on this build. You can still use the demo.",
  "auth/admin-restricted-operation": "Signing in isn't switched on for this app yet. Please try again later.",
  "auth/operation-not-allowed": "This way of signing in isn't switched on for this app yet.",
  "auth/network-request-failed": "Network problem. Check your internet connection and try again.",
  "auth/too-many-requests": "Too many attempts. Please wait a while before trying again.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/missing-password": "Enter your password.",
  "auth/weak-password": "Use a password of at least 8 characters.",
  // Never says whether an email has an account (no account enumeration).
  "auth/email-already-in-use": NEUTRAL_NOT_CREATED,
  "auth/credential-already-in-use": NEUTRAL_NOT_CREATED,
  "auth/account-not-created": NEUTRAL_NOT_CREATED,
  "auth/provider-already-linked": "This account is already saved.",
  "auth/invalid-credential": "The email or password is wrong. Check them and try again.",
  "auth/wrong-password": "The email or password is wrong. Check them and try again.",
  "auth/user-not-found": "The email or password is wrong. Check them and try again.",
  "auth/user-disabled": "This account has been switched off. Contact support.",
  "auth/requires-recent-login": "For your security, enter your password again.",
  "auth/user-mismatch": "This device is signed in to a different account. Log in again and try once more.",
  "auth/no-current-user": "This device isn't signed in to your account any more. Log out and back in, then try again.",
};

/** A user-facing message for a Firebase (or authService) error. */
export function accountErrorMessage(error) {
  return MESSAGES[error?.code] ?? "Something went wrong. Please try again.";
}
