import { beforeEach, describe, expect, it, vi } from "vitest";

const fb = vi.hoisted(() => ({
  confirm: vi.fn(),
  signInWithPhoneNumber: vi.fn(),
  signOut: vi.fn(),
  verifierClear: vi.fn(),
  verifierArgs: [],
  configured: true,
}));

vi.mock("firebase/auth", () => ({
  RecaptchaVerifier: class {
    constructor(...args) {
      fb.verifierArgs.push(args);
    }
    clear() {
      fb.verifierClear();
    }
  },
  signInWithPhoneNumber: fb.signInWithPhoneNumber,
  signOut: fb.signOut,
}));

vi.mock("./firebase", () => ({
  isFirebaseConfigured: () => fb.configured,
  getFirebaseAuth: () => ({ name: "fake-auth" }),
}));

import { confirmOtp, resetPendingOtp, sendOtp, signOutUser } from "./authService";

beforeEach(() => {
  fb.confirm.mockReset();
  fb.signInWithPhoneNumber.mockReset().mockResolvedValue({ confirm: fb.confirm });
  fb.signOut.mockReset().mockResolvedValue();
  fb.verifierClear.mockReset();
  fb.verifierArgs.length = 0;
  fb.configured = true;
  resetPendingOtp();
  document.body.innerHTML = '<div id="recaptcha-container"></div>';
});

describe("sendOtp", () => {
  it("sends to the +91 number through an invisible reCAPTCHA", async () => {
    await sendOtp("9876543210");
    expect(fb.signInWithPhoneNumber).toHaveBeenCalledTimes(1);
    const [auth, phone] = fb.signInWithPhoneNumber.mock.calls[0];
    expect(auth).toEqual({ name: "fake-auth" });
    expect(phone).toBe("+919876543210");
    expect(fb.verifierArgs[0][2]).toEqual({ size: "invisible" });
  });

  it("does not call Firebase for an invalid number", async () => {
    await expect(sendOtp("12345")).rejects.toMatchObject({ code: "auth/invalid-phone-number" });
    expect(fb.signInWithPhoneNumber).not.toHaveBeenCalled();
  });

  it("fails clearly when Firebase is not configured", async () => {
    fb.configured = false;
    await expect(sendOtp("9876543210")).rejects.toMatchObject({ code: "auth/not-configured" });
    expect(fb.signInWithPhoneNumber).not.toHaveBeenCalled();
  });

  it("passes Firebase errors through and clears the reCAPTCHA", async () => {
    fb.signInWithPhoneNumber.mockRejectedValue({ code: "auth/too-many-requests" });
    await expect(sendOtp("9876543210")).rejects.toMatchObject({ code: "auth/too-many-requests" });
    expect(fb.verifierClear).toHaveBeenCalled();
  });
});

describe("confirmOtp", () => {
  it("returns the uid and the Firebase ID token, and nothing else", async () => {
    fb.confirm.mockResolvedValue({
      user: { uid: "fb-uid-1", phoneNumber: "+919876543210", accessToken: "secret", getIdToken: async () => "firebase-id-token" },
    });
    await sendOtp("9876543210");
    await expect(confirmOtp("123456")).resolves.toEqual({ uid: "fb-uid-1", idToken: "firebase-id-token" });
    expect(fb.confirm).toHaveBeenCalledWith("123456");
  });

  it("rejects a malformed code without calling Firebase", async () => {
    await sendOtp("9876543210");
    await expect(confirmOtp("12")).rejects.toMatchObject({ code: "auth/invalid-verification-code" });
    expect(fb.confirm).not.toHaveBeenCalled();
  });

  it("fails when no OTP was requested", async () => {
    await expect(confirmOtp("123456")).rejects.toMatchObject({ code: "auth/code-expired" });
  });

  it("keeps the pending request after a wrong code so the user can retry", async () => {
    fb.confirm.mockRejectedValueOnce({ code: "auth/invalid-verification-code" }).mockResolvedValueOnce({ user: { uid: "fb-uid-1" } });
    await sendOtp("9876543210");
    await expect(confirmOtp("111111")).rejects.toMatchObject({ code: "auth/invalid-verification-code" });
    await expect(confirmOtp("123456")).resolves.toMatchObject({ uid: "fb-uid-1" });
  });

  it("never writes the OTP, the ID token or the confirmation object to storage", async () => {
    fb.confirm.mockResolvedValue({ user: { uid: "fb-uid-1", getIdToken: async () => "firebase-id-token" } });
    await sendOtp("9876543210");
    await confirmOtp("123456");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe("signOutUser", () => {
  it("signs out of Firebase", async () => {
    await signOutUser();
    expect(fb.signOut).toHaveBeenCalledWith({ name: "fake-auth" });
  });

  it("does nothing when Firebase is not configured", async () => {
    fb.configured = false;
    await signOutUser();
    expect(fb.signOut).not.toHaveBeenCalled();
  });

  it("swallows a sign-out failure so logout always completes", async () => {
    fb.signOut.mockRejectedValue(new Error("offline"));
    await expect(signOutUser()).resolves.toBeUndefined();
  });
});
