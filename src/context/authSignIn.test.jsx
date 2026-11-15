// Sign-in fetches the new user's shared data at once (and drops the previous
// user's), in both builds. A token refresh for the same person changes nothing.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/authService", () => ({
  logIn: vi.fn(async ({ email }) => ({ uid: "email-1", idToken: "t", email, emailVerified: true })),
  signOutUser: vi.fn(async () => {}),
}));

vi.mock("../services/locationStore", () => ({
  refreshAfterSignIn: vi.fn(() => Promise.resolve()),
  resetStore: vi.fn(),
}));

// A stand-in session client for the API build: tests drive its onChange.
const client = {
  listeners: new Set(),
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  emit(user, reason) {
    for (const fn of this.listeners) fn({ user, reason });
  },
  restore: vi.fn(() => Promise.resolve(null)),
  loginDemo: vi.fn(async (role) => {
    const u = { uid: `api-${role}`, role, name: role, isDemo: true };
    client.emit(u, "login"); // the real client announces before it resolves
    return { accessToken: "t", user: u };
  }),
  logout: vi.fn(),
};
vi.mock("../services/session", async (orig) => ({ ...(await orig()), getSessionClient: () => client }));

import { AuthProvider, useAuth } from "./AuthContext";
import { refreshAfterSignIn, resetStore } from "../services/locationStore";
import { agreeOnThisDevice } from "../test/consent";

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  refreshAfterSignIn.mockClear();
  resetStore.mockClear();
  client.listeners.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe("browser-only build", () => {
  it("demo and email sign-ins fetch the new user's data at once", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login("official", "");
    });
    expect(refreshAfterSignIn).toHaveBeenCalledTimes(1);
    act(() => result.current.resetAuth());
    expect(resetStore).toHaveBeenCalled();
    agreeOnThisDevice(); // a logout forgets the agreement; the next person agrees again
    await act(async () => {
      await result.current.logInWithEmail({ email: "asha@example.test", password: "s3cret-pass" });
    });
    expect(result.current.user).toMatchObject({ id: "email-1", role: "citizen", method: "email" });
    expect(refreshAfterSignIn).toHaveBeenCalledTimes(2);
  });

  it("a sign-in in another tab (as someone else) fetches that user's data here too", () => {
    renderHook(() => useAuth(), { wrapper });
    act(() => {
      localStorage.setItem("ssb_auth_session_v1", JSON.stringify({ id: "w1", name: "Demo Worker", role: "worker", method: "demo", loginAt: new Date().toISOString() }));
      window.dispatchEvent(new StorageEvent("storage", { key: "ssb_auth_session_v1" }));
    });
    expect(refreshAfterSignIn).toHaveBeenCalledTimes(1);
  });
});

describe("API build", () => {
  beforeEach(() => vi.stubEnv("VITE_USE_API", "true"));

  it("unmounting stops following the session client (no listener left behind)", async () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    expect(client.listeners.size).toBe(1);
    unmount();
    expect(client.listeners.size).toBe(0);
  });

  it("signing in fetches once (not twice for the same login)", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login("official");
    });
    expect(result.current.user).toMatchObject({ id: "api-official", role: "official" });
    expect(refreshAfterSignIn).toHaveBeenCalledTimes(1);
  });

  it("a token refresh for the same person doesn't reset or re-fetch", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login("citizen");
    });
    refreshAfterSignIn.mockClear();
    resetStore.mockClear();
    act(() => client.emit({ uid: "api-citizen", role: "citizen", name: "citizen", isDemo: true }, "refresh"));
    expect(refreshAfterSignIn).not.toHaveBeenCalled();
    expect(resetStore).not.toHaveBeenCalled();
  });

  it("another tab signing in as someone else re-fetches; signing out clears", async () => {
    renderHook(() => useAuth(), { wrapper });
    act(() => client.emit({ uid: "api-citizen", role: "citizen", name: "c", isDemo: true }, "sync"));
    expect(refreshAfterSignIn).toHaveBeenCalledTimes(1);
    act(() => client.emit({ uid: "api-official", role: "official", name: "o", isDemo: true }, "sync"));
    expect(refreshAfterSignIn).toHaveBeenCalledTimes(2);
    resetStore.mockClear();
    act(() => client.emit(null, "logout"));
    expect(resetStore).toHaveBeenCalledTimes(1);
    expect(refreshAfterSignIn).toHaveBeenCalledTimes(2);
  });
});
