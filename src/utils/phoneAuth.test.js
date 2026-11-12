import { describe, expect, it } from "vitest";
import { authErrorMessage, maskPhone, toE164, validateOtp, validatePhone } from "./phoneAuth";

describe("validatePhone", () => {
  it("accepts a 10 digit Indian mobile starting with 6 to 9", () => {
    for (const n of ["9876543210", "6000000000", "7123456789", "8999999999"]) {
      expect(validatePhone(n)).toEqual({ ok: true, error: "" });
    }
  });

  it("rejects numbers that start with 0 to 5", () => {
    for (const n of ["5876543210", "0876543210", "1234567890"]) {
      expect(validatePhone(n).ok).toBe(false);
    }
  });

  it("rejects the wrong length, letters, spaces and a pasted +91", () => {
    for (const n of ["", "987654321", "98765432101", "98765abc10", "98765 43210", "+919876543210", null, undefined, 9876543210]) {
      const result = validatePhone(n);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/10 digit/i);
    }
  });
});

describe("validateOtp", () => {
  it("accepts exactly 6 digits", () => {
    expect(validateOtp("123456")).toEqual({ ok: true, error: "" });
    expect(validateOtp("000000").ok).toBe(true);
  });

  it("rejects anything else", () => {
    for (const c of ["", "12345", "1234567", "12a456", "12 456", null, undefined, 123456]) {
      expect(validateOtp(c).ok).toBe(false);
    }
  });
});

describe("toE164", () => {
  it("adds the fixed +91 prefix", () => {
    expect(toE164("9876543210")).toBe("+919876543210");
  });
});

describe("maskPhone", () => {
  it("keeps the first two and last two digits only", () => {
    expect(maskPhone("9876543210")).toBe("+91 98XXXXXX10");
  });

  it("never returns the middle digits", () => {
    expect(maskPhone("9876543210")).not.toContain("765432");
  });

  it("returns an empty string for an invalid number", () => {
    expect(maskPhone("12345")).toBe("");
  });
});

describe("authErrorMessage", () => {
  it("has a clear message for each known failure", () => {
    expect(authErrorMessage({ code: "auth/invalid-phone-number" })).toMatch(/valid 10 digit/i);
    expect(authErrorMessage({ code: "auth/invalid-verification-code" })).toMatch(/incorrect/i);
    expect(authErrorMessage({ code: "auth/code-expired" })).toMatch(/expired/i);
    expect(authErrorMessage({ code: "auth/too-many-requests" })).toMatch(/too many attempts/i);
    expect(authErrorMessage({ code: "auth/network-request-failed" })).toMatch(/network/i);
    expect(authErrorMessage({ code: "auth/not-configured" })).toMatch(/not set up/i);
  });

  it("falls back to a generic message and never leaks the raw error", () => {
    const msg = authErrorMessage(new Error("Firebase: internal stack detail"));
    expect(msg).toMatch(/something went wrong/i);
    expect(msg).not.toContain("stack detail");
    expect(authErrorMessage(null)).toMatch(/something went wrong/i);
  });
});
