import { describe, expect, it } from "vitest";
import { DEMO_USERS, LOGIN_METHOD, clearLegacySessions, clearSession, markSignedOut, readSession, startEmailSession, startSession, updateSession } from "./authSession";

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

describe("email account sessions", () => {
  it("are always citizens, whatever the caller asks for", () => {
    for (const role of ["official", "worker", "superadmin"]) {
      expect(startEmailSession({ uid: "fb-user-1", email: "a@example.test", role }).role).toBe("citizen");
    }
    expect(readSession()).toMatchObject({ id: "fb-user-1", role: "citizen", method: "email" });
  });

  it("keep only the masked email", () => {
    startEmailSession({ uid: "fb-user-1", email: "Asha.Verma@Example.test", emailVerified: false });
    expect(stored()).toMatchObject({ method: "email", email: "as***@e***.test", emailVerified: false });
    expect(localStorage.getItem(KEY).toLowerCase()).not.toContain("asha.verma");
    expect(Object.keys(stored()).sort()).toEqual(["email", "emailVerified", "id", "loginAt", "method", "name", "role"]);
  });

  it("need a uid and an email, and can't borrow a demo user's id", () => {
    expect(() => startEmailSession({ uid: "", email: "a@example.test" })).toThrow();
    expect(() => startEmailSession({ uid: "demo-official", email: "a@example.test" })).toThrow();
    expect(() => startEmailSession({ uid: "x", email: null })).toThrow();
  });

  it("a stored session edited to a staff role is signed out", () => {
    for (const role of ["worker", "official"]) {
      localStorage.setItem(KEY, JSON.stringify({ id: "fb-user-1", name: "citizen", role, method: "email", email: "a***@e***.test", loginAt: "2026-01-01T00:00:00.000Z" }));
      expect(readSession()).toBeNull();
    }
  });

  it("updateSession changes the name or 'verified', never the id or role", () => {
    startEmailSession({ uid: "fb-user-1", email: "a@example.test" });
    const next = updateSession({ name: "  Asha  ", role: "official", id: "other", emailVerified: true });
    expect(next).toMatchObject({ id: "fb-user-1", role: "citizen", name: "Asha", emailVerified: true });
    expect(readSession().name).toBe("Asha");
  });
});

describe("sessions from earlier builds without an account", () => {
  it("'Continue without account' (anonymous) and phone (OTP) sessions read as signed out", () => {
    for (const method of ["anonymous", "otp"]) {
      localStorage.setItem(KEY, JSON.stringify({ id: "fb-anon-1", name: "citizen", role: "citizen", method, email: null, loginAt: "2026-01-01T00:00:00.000Z" }));
      expect(readSession(), method).toBeNull();
    }
  });

  it("their leftover flags are cleared", () => {
    for (const k of ["ssb_signed_out_v1", "ssb_local_citizen_id_v1", "ssb_continued_anon_v1"]) localStorage.setItem(k, "1");
    clearLegacySessions();
    for (const k of ["ssb_signed_out_v1", "ssb_local_citizen_id_v1", "ssb_continued_anon_v1"]) expect(localStorage.getItem(k)).toBeNull();
  });
});

describe("signing out", () => {
  it("forgets this device's consent, so the next person is asked again", () => {
    localStorage.setItem("ssb_device_consent_v1", "{}");
    markSignedOut();
    expect(localStorage.getItem("ssb_device_consent_v1")).toBeNull();
  });

  it("clearSession clears both kinds of session", () => {
    startSession("official", "");
    clearSession();
    expect(readSession()).toBeNull();
    startEmailSession({ uid: "fb-user-1", email: "a@example.test" });
    clearSession();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("corrupted JSON or a demo session with a forged id is signed out", () => {
    localStorage.setItem(KEY, "{not json");
    expect(readSession()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ id: "someone-else", name: "x", role: "official", method: "demo" }));
    expect(readSession()).toBeNull();
  });
});
