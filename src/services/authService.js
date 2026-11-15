// Firebase Authentication: email + password accounts only. No phone numbers,
// no anonymous sign-in.
//   - "Create account" makes the account and sends the verification email;
//     the user is a citizen at once (a staff role needs the email verified)
//   - "Log in" signs in; Firebase keeps the sign-in on this device
//   - "Forgot password?" sends the reset email
//   - the Profile changes the password and deletes the account
//
// This is the only module that talks to Firebase, so screens and tests can
// mock it. Passwords are passed straight to Firebase and never stored. No
// message from here says whether an email has an account. Firebase is loaded
// on demand, so the demo login never pays for it.

const MIN_PASSWORD_LENGTH = 8; // Firebase's own minimum is 6; ask for a little more

function authError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

const normaliseEmail = (email) => String(email ?? "").trim().toLowerCase();
const looksLikeEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

async function firebase() {
  const { getFirebaseAuth, isFirebaseConfigured } = await import("./firebase");
  if (!isFirebaseConfigured()) throw authError("auth/not-configured");
  const sdk = await import("firebase/auth");
  return { auth: getFirebaseAuth(), sdk };
}

/** What the app needs from a Firebase user (and an ID token for the API). */
async function describe(user, { refresh = false } = {}) {
  const idToken = typeof user.getIdToken === "function" ? await user.getIdToken(refresh) : null;
  return {
    uid: user.uid,
    idToken,
    email: user.email ?? null,
    emailVerified: Boolean(user.emailVerified),
  };
}

/** Whether this build has Firebase at all (only the demo works otherwise). */
export async function firebaseAvailable() {
  const { isFirebaseConfigured } = await import("./firebase");
  return isFirebaseConfigured();
}

function checkNewPassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) throw authError("auth/weak-password");
}

/** "Log in" on the start screen. */
export async function logIn({ email, password }) {
  const address = normaliseEmail(email);
  if (!looksLikeEmail(address)) throw authError("auth/invalid-email");
  if (typeof password !== "string" || !password) throw authError("auth/missing-password");
  const { auth, sdk } = await firebase();
  const { user } = await sdk.signInWithEmailAndPassword(auth, address, password);
  return describe(user);
}

/**
 * "Create account": a new email + password account, and the verification
 * email. An address that already has an account is reported only as
 * "auth/account-not-created", the same as any other refusal, so the screen
 * can't tell anyone which emails are registered.
 */
export async function createAccount({ email, password }) {
  const address = normaliseEmail(email);
  if (!looksLikeEmail(address)) throw authError("auth/invalid-email");
  checkNewPassword(password);
  const { auth, sdk } = await firebase();
  let user;
  try {
    ({ user } = await sdk.createUserWithEmailAndPassword(auth, address, password));
  } catch (error) {
    if (["auth/email-already-in-use", "auth/credential-already-in-use"].includes(error?.code)) throw authError("auth/account-not-created");
    throw error;
  }
  let verificationSent = true;
  try {
    await sdk.sendEmailVerification(user);
  } catch {
    verificationSent = false;
  }
  return { ...(await describe(user, { refresh: true })), email: user.email ?? address, verificationSent };
}

// The only reset failures worth telling the user about: they can do something about them.
const RESET_ERRORS_SHOWN = new Set(["auth/invalid-email", "auth/network-request-failed", "auth/too-many-requests", "auth/not-configured"]);

/**
 * "Forgot password?": sends the reset email. Resolves the same way whether or
 * not the address has an account, so it reveals nothing.
 */
export async function sendPasswordReset(email) {
  const address = normaliseEmail(email);
  if (!looksLikeEmail(address)) throw authError("auth/invalid-email");
  const { auth, sdk } = await firebase();
  try {
    await sdk.sendPasswordResetEmail(auth, address);
  } catch (error) {
    if (RESET_ERRORS_SHOWN.has(error?.code)) throw error;
  }
}

/** After the user clicked the link in the verification email: the account's current state, with a fresh token. */
export async function refreshAccount() {
  const { auth } = await firebase();
  const user = auth.currentUser;
  if (!user) throw authError("auth/no-current-user");
  await user.reload();
  return describe(user, { refresh: true });
}

export async function resendVerification() {
  const { auth, sdk } = await firebase();
  if (!auth.currentUser) throw authError("auth/no-current-user");
  await sdk.sendEmailVerification(auth.currentUser);
}

/**
 * Confirms the password before something sensitive (Firebase only allows it
 * after a recent sign-in). A wrong password rejects, and nothing has changed.
 */
export async function verifyPassword(password) {
  const { auth, sdk } = await firebase();
  const user = auth.currentUser;
  if (!user?.email) throw authError("auth/no-current-user");
  await sdk.reauthenticateWithCredential(user, sdk.EmailAuthProvider.credential(user.email, password));
}

/** Profile, "Change password": the current one first, then the new one (8+ characters). */
export async function changePassword({ current, next }) {
  if (typeof current !== "string" || !current) throw authError("auth/missing-password");
  checkNewPassword(next);
  const { auth, sdk } = await firebase();
  const user = auth.currentUser;
  if (!user?.email) throw authError("auth/no-current-user");
  await sdk.reauthenticateWithCredential(user, sdk.EmailAuthProvider.credential(user.email, current));
  await sdk.updatePassword(user, next);
}

/**
 * Deletes the Firebase account signed in on this device (user.delete()),
 * only if it is the app's own user (`expectedUid`). Call verifyPassword
 * first. Resolves { deleted }.
 */
export async function deleteFirebaseAccount({ expectedUid }) {
  let auth;
  try {
    ({ auth } = await firebase());
  } catch {
    return { deleted: false }; // no Firebase in this build
  }
  const user = auth.currentUser;
  if (!user) return { deleted: false };
  if (expectedUid && user.uid !== expectedUid) throw authError("auth/user-mismatch");
  await user.delete();
  return { deleted: true };
}

/** Signs out of Firebase. Never rejects, so logout always completes locally. */
export async function signOutUser() {
  try {
    const { getFirebaseAuth, isFirebaseConfigured } = await import("./firebase");
    if (!isFirebaseConfigured()) return;
    const { signOut } = await import("firebase/auth");
    await signOut(getFirebaseAuth());
  } catch {
    // offline or already signed out — the local session is cleared regardless
  }
}
