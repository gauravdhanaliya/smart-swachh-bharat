// Firebase Authentication: email + password accounts only (no anonymous
// sign-in, no phone). Create account, log in, forgot password, change
// password, delete; nothing here says whether an email has an account.

import { beforeEach, describe, expect, it, vi } from "vitest";

const fb = vi.hoisted(() => ({
  auth: { name: "fake-auth", currentUser: null },
  configured: true,
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  updatePassword: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: (email, password) => ({ providerId: "password", email, password }) },
  sendEmailVerification: fb.sendEmailVerification,
  signInWithEmailAndPassword: fb.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: fb.createUserWithEmailAndPassword,
  sendPasswordResetEmail: fb.sendPasswordResetEmail,
  reauthenticateWithCredential: fb.reauthenticateWithCredential,
  updatePassword: fb.updatePassword,
  signInAnonymously: fb.signInAnonymously,
  signOut: fb.signOut,
}));

vi.mock("./firebase", () => ({
  isFirebaseConfigured: () => fb.configured,
  getFirebaseAuth: () => fb.auth,
}));

import * as authService from "./authService";
import {
  changePassword,
  createAccount,
  deleteFirebaseAccount,
  sendPasswordReset,
  firebaseAvailable,
  logIn,
  refreshAccount,
  resendVerification,
  signOutUser,
  verifyPassword,
} from "./authService";

const authError = (code) => Object.assign(new Error(code), { code });

/** A Firebase user as the SDK hands it out. */
function fakeUser({ uid = "fb-user-1", email = "asha@example.test", emailVerified = false, token = `token-of-${uid}` } = {}) {
  return {
    uid,
    email,
    emailVerified,
    getIdToken: vi.fn().mockResolvedValue(token),
    reload: vi.fn().mockResolvedValue(),
    delete: vi.fn().mockResolvedValue(),
  };
}

beforeEach(() => {
  fb.auth.currentUser = null;
  fb.configured = true;
  for (const key of ["sendEmailVerification", "signInWithEmailAndPassword", "createUserWithEmailAndPassword", "sendPasswordResetEmail", "reauthenticateWithCredential", "updatePassword", "signInAnonymously", "signOut"]) {
    fb[key].mockReset();
  }
  fb.signOut.mockResolvedValue();
  fb.sendEmailVerification.mockResolvedValue();
});

describe("no anonymous sign-in", () => {
  it("there is no way to sign in without an account, and nothing calls signInAnonymously", () => {
    expect(authService.signInAsCitizen).toBeUndefined();
    expect(authService.saveAccount).toBeUndefined();
    expect(fb.signInAnonymously).not.toHaveBeenCalled();
  });

  it("firebaseAvailable says whether this build has Firebase", async () => {
    await expect(firebaseAvailable()).resolves.toBe(true);
    fb.configured = false;
    await expect(firebaseAvailable()).resolves.toBe(false);
    await expect(logIn({ email: "a@example.test", password: "x" })).rejects.toMatchObject({ code: "auth/not-configured" });
  });
});

describe("logIn", () => {
  it("signs in with email + password and returns the account's uid and token", async () => {
    const user = fakeUser({ uid: "saved-1", emailVerified: true });
    fb.signInWithEmailAndPassword.mockResolvedValue({ user });
    await expect(logIn({ email: " Asha@example.test ", password: "s3cret-pass" })).resolves.toEqual({
      uid: "saved-1",
      idToken: "token-of-saved-1",
      email: "asha@example.test",
      emailVerified: true,
    });
    expect(fb.signInWithEmailAndPassword).toHaveBeenCalledWith(fb.auth, "asha@example.test", "s3cret-pass");
  });

  it("checks the input before calling Firebase", async () => {
    await expect(logIn({ email: "nope", password: "x" })).rejects.toMatchObject({ code: "auth/invalid-email" });
    await expect(logIn({ email: "a@example.test", password: "" })).rejects.toMatchObject({ code: "auth/missing-password" });
    expect(fb.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});

describe("changePassword", () => {
  it("confirms the current password, then sets the new one", async () => {
    const user = fakeUser();
    fb.auth.currentUser = user;
    fb.reauthenticateWithCredential.mockResolvedValue({ user });
    fb.updatePassword.mockResolvedValue();
    await changePassword({ current: "old-pass-1", next: "new-pass-22" });
    expect(fb.reauthenticateWithCredential.mock.calls[0][1]).toEqual({ providerId: "password", email: "asha@example.test", password: "old-pass-1" });
    expect(fb.updatePassword).toHaveBeenCalledWith(user, "new-pass-22");
  });

  it("a wrong current password changes nothing", async () => {
    fb.auth.currentUser = fakeUser();
    fb.reauthenticateWithCredential.mockRejectedValue(authError("auth/invalid-credential"));
    await expect(changePassword({ current: "wrong", next: "new-pass-22" })).rejects.toMatchObject({ code: "auth/invalid-credential" });
    expect(fb.updatePassword).not.toHaveBeenCalled();
  });

  it("a new password under 8 characters is refused before calling Firebase", async () => {
    fb.auth.currentUser = fakeUser();
    await expect(changePassword({ current: "old-pass-1", next: "short" })).rejects.toMatchObject({ code: "auth/weak-password" });
    expect(fb.reauthenticateWithCredential).not.toHaveBeenCalled();
  });
});

describe("logIn (more)", () => {
  it("passes a refused sign-in on (the screen shows one message for every such refusal)", async () => {
    fb.signInWithEmailAndPassword.mockRejectedValue(authError("auth/invalid-credential"));
    await expect(logIn({ email: "asha@example.test", password: "wrong-pass" })).rejects.toMatchObject({ code: "auth/invalid-credential" });
  });
});

describe("after verifying the email", () => {
  it("refreshAccount reloads the user and returns a fresh token with the new state", async () => {
    const user = fakeUser({ email: "a@example.test" });
    user.reload.mockImplementation(async () => {
      user.emailVerified = true;
    });
    fb.auth.currentUser = user;
    await expect(refreshAccount()).resolves.toMatchObject({ emailVerified: true, idToken: "token-of-fb-user-1" });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });

  it("resendVerification sends the email again", async () => {
    fb.auth.currentUser = fakeUser({ email: "a@example.test" });
    await resendVerification();
    expect(fb.sendEmailVerification).toHaveBeenCalledWith(fb.auth.currentUser);
  });
});

describe("deleting the Firebase account", () => {
  it("confirms the password first (re-authentication), then deletes", async () => {
    const user = fakeUser();
    fb.auth.currentUser = user;
    fb.reauthenticateWithCredential.mockResolvedValue({ user });
    await verifyPassword("s3cret-pass");
    const [reauthUser, credential] = fb.reauthenticateWithCredential.mock.calls[0];
    expect(reauthUser).toBe(user);
    expect(credential).toEqual({ providerId: "password", email: "asha@example.test", password: "s3cret-pass" });
    await expect(deleteFirebaseAccount({ expectedUid: "fb-user-1" })).resolves.toEqual({ deleted: true });
    expect(user.delete).toHaveBeenCalled();
  });

  it("a wrong password stops before anything is deleted", async () => {
    fb.auth.currentUser = fakeUser();
    fb.reauthenticateWithCredential.mockRejectedValue(authError("auth/invalid-credential"));
    await expect(verifyPassword("wrong")).rejects.toMatchObject({ code: "auth/invalid-credential" });
    expect(fb.auth.currentUser.delete).not.toHaveBeenCalled();
  });

  it("never deletes a different account than the one signed in to the app", async () => {
    const user = fakeUser({ uid: "someone-else" });
    fb.auth.currentUser = user;
    await expect(deleteFirebaseAccount({ expectedUid: "fb-user-1" })).rejects.toMatchObject({ code: "auth/user-mismatch" });
    expect(user.delete).not.toHaveBeenCalled();
  });

  it("with no Firebase sign-in on this device there is nothing to delete", async () => {
    await expect(deleteFirebaseAccount({ expectedUid: "fb-user-1" })).resolves.toEqual({ deleted: false });
  });
});

describe("signOutUser", () => {
  it("signs out of Firebase and never rejects", async () => {
    fb.signOut.mockRejectedValue(new Error("offline"));
    await expect(signOutUser()).resolves.toBeUndefined();
  });
});

describe("createAccount", () => {
  it("creates an email + password account, sends the verification email, and returns its token", async () => {
    const user = fakeUser({ uid: "new-1", email: "asha@example.test" });
    fb.createUserWithEmailAndPassword.mockResolvedValue({ user });
    const result = await createAccount({ email: " Asha@Example.test ", password: "s3cret-pass" });
    expect(fb.createUserWithEmailAndPassword).toHaveBeenCalledWith(fb.auth, "asha@example.test", "s3cret-pass");
    expect(fb.sendEmailVerification).toHaveBeenCalledWith(user);
    expect(result).toMatchObject({ uid: "new-1", idToken: "token-of-new-1", email: "asha@example.test", verificationSent: true });
  });

  it("checks the input before calling Firebase", async () => {
    await expect(createAccount({ email: "nope", password: "s3cret-pass" })).rejects.toMatchObject({ code: "auth/invalid-email" });
    await expect(createAccount({ email: "a@example.test", password: "short" })).rejects.toMatchObject({ code: "auth/weak-password" });
    expect(fb.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("an email that already has an account comes back as one neutral error code", async () => {
    fb.createUserWithEmailAndPassword.mockRejectedValue(authError("auth/email-already-in-use"));
    await expect(createAccount({ email: "taken@example.test", password: "s3cret-pass" })).rejects.toMatchObject({ code: "auth/account-not-created" });
  });
});

describe("sendPasswordReset never says whether an email has an account", () => {
  it("sends the reset email", async () => {
    fb.sendPasswordResetEmail.mockResolvedValue();
    await sendPasswordReset(" Asha@example.test ");
    expect(fb.sendPasswordResetEmail).toHaveBeenCalledWith(fb.auth, "asha@example.test");
  });

  it("an unknown email looks exactly like success", async () => {
    fb.sendPasswordResetEmail.mockRejectedValue(authError("auth/user-not-found"));
    await expect(sendPasswordReset("nobody@example.test")).resolves.toBeUndefined();
  });

  it("only a problem the user can fix is reported: bad address, network, too many tries", async () => {
    await expect(sendPasswordReset("not-an-email")).rejects.toMatchObject({ code: "auth/invalid-email" });
    for (const code of ["auth/network-request-failed", "auth/too-many-requests"]) {
      fb.sendPasswordResetEmail.mockRejectedValueOnce(authError(code));
      await expect(sendPasswordReset("a@example.test")).rejects.toMatchObject({ code });
    }
  });
});
