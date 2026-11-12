import { describe, expect, it } from "vitest";
import {
  DEMO_USERS,
  LOGIN_METHOD,
  clearSession,
  readSession,
  startOtpSession,
  startSession,
} from "./authSession";

const KEY = "ssb_auth_session_v1";
const stored = () => JSON.parse(localStorage.getItem(KEY));

describe("demo sessions", () => {
  it("saves a demo session for each role and reads it back", () => {
    for (const role of ["citizen", "worker", "official"]) {
      const session = startSession(role, "  Asha   Rao ");
      expect(session).toMatchObject({ id: DEMO_USERS[role].id, name: "Asha Rao", role, method: LOGIN_METHOD.DEMO });
      expect(readSession()).toEqual(session);
    }
  });

  it("still reads a session saved by an earlier build (no method field) as demo", () => {
    localStorage.setItem(KEY, JSON.stringify({ id: "w1", name: "Demo Worker", role: "worker", loginAt: "2026-01-01T00:00:00.000Z" }));
    expect(readSession()).toMatchObject({ role: "worker", method: "demo" });
  });

  it("rejects an unknown role", () => {
    expect(() => startSession("superadmin", "x")).toThrow();
  });
});

describe("OTP sessions", () => {
  it("always signs an OTP user in as a citizen", () => {
    const session = startOtpSession({ uid: "fb-uid-1", phone: "9876543210" });
    expect(session.role).toBe("citizen");
    expect(session.method).toBe(LOGIN_METHOD.OTP);
    expect(readSession()).toEqual(session);
  });

  it("ignores a role passed in by the caller", () => {
    expect(startOtpSession({ uid: "fb-uid-1", phone: "9876543210", role: "official" }).role).toBe("citizen");
    expect(startOtpSession({ uid: "fb-uid-1", phone: "9876543210", role: "worker" }).role).toBe("citizen");
  });

  it("stores only uid, masked phone, role, method, name and login time", () => {
    startOtpSession({ uid: "fb-uid-1", phone: "9876543210" });
    expect(Object.keys(stored()).sort()).toEqual(["id", "loginAt", "method", "name", "phone", "role"]);
    expect(stored().id).toBe("fb-uid-1");
    expect(stored().phone).toBe("+91 98XXXXXX10");
    expect(localStorage.getItem(KEY)).not.toContain("9876543210");
    expect(localStorage.getItem(KEY)).not.toContain("76543");
  });

  it("needs a uid and a valid phone", () => {
    expect(() => startOtpSession({ uid: "", phone: "9876543210" })).toThrow();
    expect(() => startOtpSession({ uid: "fb-uid-1", phone: "123" })).toThrow();
  });

  it("treats a stored OTP session with a worker or official role as signed out", () => {
    for (const role of ["worker", "official"]) {
      localStorage.setItem(KEY, JSON.stringify({ id: "fb-uid-1", name: "Citizen", role, method: "otp", phone: "+91 98XXXXXX10", loginAt: "2026-01-01T00:00:00.000Z" }));
      expect(readSession()).toBeNull();
    }
  });
});

describe("clearSession and bad storage", () => {
  it("clears both kinds of session", () => {
    startSession("official", "");
    clearSession();
    expect(readSession()).toBeNull();
    startOtpSession({ uid: "fb-uid-1", phone: "9876543210" });
    clearSession();
    expect(readSession()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("treats corrupted JSON as signed out", () => {
    localStorage.setItem(KEY, "{not json");
    expect(readSession()).toBeNull();
  });

  it("treats a demo session with a forged id as signed out", () => {
    localStorage.setItem(KEY, JSON.stringify({ id: "someone-else", name: "x", role: "official", method: "demo" }));
    expect(readSession()).toBeNull();
  });
});
