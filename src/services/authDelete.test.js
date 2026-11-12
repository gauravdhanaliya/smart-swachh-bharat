// Deleting the Firebase sign-in on the device (Feature 5): a fresh OTP first
// (Firebase needs a recent sign-in for user.delete()), then user.delete().

import { beforeEach, describe, expect, it, vi } from "vitest";

const fb = vi.hoisted(() => ({
  currentUser: null,
  confirm: vi.fn(),
  signInWithPhoneNumber: vi.fn(),
  reauthenticateWithPhoneNumber: vi.fn(),
  signOut: vi.fn(),
  configured: true,
}));

vi.mock("firebase/auth", () => ({
  RecaptchaVerifier: class {
    clear() {}
  },
  signInWithPhoneNumber: fb.signInWithPhoneNumber,
  reauthenticateWithPhoneNumber: fb.reauthenticateWithPhoneNumber,
  signOut: fb.signOut,
}));
vi.mock("./firebase", () => ({
  isFirebaseConfigured: () => fb.configured,
  getFirebaseAuth: () => ({ name: "fake-auth", currentUser: fb.currentUser }),
}));

import { confirmDeleteOtp, firebaseDeletionAvailable, resetPendingOtp, sendDeleteOtp } from "./authService";

const user = (uid, del = vi.fn().mockResolvedValue()) => ({ uid, delete: del });
const authError = (code) => Object.assign(new Error(code), { code });

beforeEach(() => {
  fb.currentUser = null;
  fb.confirm.mockReset();
  fb.signInWithPhoneNumber.mockReset().mockResolvedValue({ confirm: fb.confirm });
  fb.reauthenticateWithPhoneNumber.mockReset().mockResolvedValue({ confirm: fb.confirm });
  fb.signOut.mockReset().mockResolvedValue();
  fb.configured = true;
  resetPendingOtp();
  document.body.innerHTML = '<div id="recaptcha-container"></div>';
});

describe("sending the fresh code", () => {
  it("re-verifies the signed-in Firebase user when there is one", async () => {
    fb.currentUser = user("uid-1");
    await sendDeleteOtp("9876543210");
    expect(fb.reauthenticateWithPhoneNumber).toHaveBeenCalledWith(fb.currentUser, "+919876543210", expect.anything());
    expect(fb.signInWithPhoneNumber).not.toHaveBeenCalled();
  });

  it("signs in with the number when this device no longer holds the Firebase sign-in", async () => {
    await sendDeleteOtp("9876543210");
    expect(fb.signInWithPhoneNumber).toHaveBeenCalledWith(expect.anything(), "+919876543210", expect.anything());
  });

  it("checks the number before calling Firebase", async () => {
    await expect(sendDeleteOtp("123")).rejects.toMatchObject({ code: "auth/invalid-phone-number" });
    expect(fb.signInWithPhoneNumber).not.toHaveBeenCalled();
  });
});

describe("confirming and deleting", () => {
  it("a correct code for the same account: user.delete() removes the Firebase sign-in", async () => {
    const me = user("uid-1");
    fb.currentUser = me;
    fb.confirm.mockResolvedValue({ user: me });
    await sendDeleteOtp("9876543210");
    await confirmDeleteOtp("123456", { expectedUid: "uid-1" });
    expect(fb.confirm).toHaveBeenCalledWith("123456");
    expect(me.delete).toHaveBeenCalledTimes(1);
  });

  it("another account's number: nothing is deleted, that sign-in is ended, and the error says so", async () => {
    const other = user("someone-else");
    fb.confirm.mockResolvedValue({ user: other });
    await sendDeleteOtp("9876543211");
    await expect(confirmDeleteOtp("123456", { expectedUid: "uid-1" })).rejects.toMatchObject({ code: "auth/user-mismatch" });
    expect(other.delete).not.toHaveBeenCalled();
    expect(fb.signOut).toHaveBeenCalled();
  });

  it("auth/requires-recent-login is passed on, and a new code is needed for the retry", async () => {
    const me = user("uid-1", vi.fn().mockRejectedValueOnce(authError("auth/requires-recent-login")).mockResolvedValue());
    fb.confirm.mockResolvedValue({ user: me });
    await sendDeleteOtp("9876543210");
    await expect(confirmDeleteOtp("123456", { expectedUid: "uid-1" })).rejects.toMatchObject({ code: "auth/requires-recent-login" });
    await expect(confirmDeleteOtp("123456", { expectedUid: "uid-1" })).rejects.toMatchObject({ code: "auth/code-expired" });
    await sendDeleteOtp("9876543210");
    await confirmDeleteOtp("654321", { expectedUid: "uid-1" });
    expect(me.delete).toHaveBeenCalledTimes(2);
  });

  it("a wrong code deletes nothing", async () => {
    fb.confirm.mockRejectedValue(authError("auth/invalid-verification-code"));
    await sendDeleteOtp("9876543210");
    await expect(confirmDeleteOtp("000000", { expectedUid: "uid-1" })).rejects.toMatchObject({ code: "auth/invalid-verification-code" });
  });

  it("the code is checked before calling Firebase", async () => {
    await sendDeleteOtp("9876543210");
    await expect(confirmDeleteOtp("12", { expectedUid: "uid-1" })).rejects.toMatchObject({ code: "auth/invalid-verification-code" });
    expect(fb.confirm).not.toHaveBeenCalled();
  });

  it("knows when Firebase isn't set up (nothing to delete on this build)", async () => {
    expect(await firebaseDeletionAvailable()).toBe(true);
    fb.configured = false;
    expect(await firebaseDeletionAvailable()).toBe(false);
  });
});
