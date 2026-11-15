// Demo-login sessions through AuthContext, and the RequireRole guard
// (ported from main's 7cef7da auth.test and flows.test "route isolation",
// rewritten for: demo login + anonymous citizens, no profile-setup step,
// the consent gate, and cross-role visits going to the user's own home).
import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import RequireRole from "../components/RequireRole";
import { DEMO_USERS, ROLE_HOME, readSession, startEmailSession, startSession } from "../services/authSession";
import { getConsentStatus } from "../services/consentService";
import { acceptConsentForAll, firstVisit } from "../test/consent";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe("demo login session", () => {
  it("creates { id, name, role, method, loginAt } and saves it", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login("citizen", "Asha");
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toMatchObject({ id: DEMO_USERS.citizen.id, name: "Asha", role: "citizen", method: "demo" });
    expect(Date.parse(result.current.user.loginAt)).not.toBeNaN();
    expect(readSession()).toEqual(result.current.user);
  });

  it("a blank name falls back to the role's demo name", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    for (const [role, name] of [
      ["citizen", "Demo Citizen"],
      ["worker", "Demo Worker"],
      ["official", "Demo Official"],
    ]) {
      act(() => {
        result.current.login(role, "   ");
      });
      expect(result.current.user.name).toBe(name);
    }
  });

  it("the worker signs in as the seeded demo worker w1", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login("worker", "");
    });
    expect(result.current.user.id).toBe("w1");
  });

  it("logout clears the session", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login("official", "");
    });
    act(() => {
      result.current.resetAuth();
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(readSession()).toBeNull();
  });

  it("a refresh keeps the session (a fresh provider reads it back)", () => {
    startSession("worker", "Ravi");
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toMatchObject({ id: "w1", name: "Ravi", role: "worker" });
  });

  it("ignores a stored session with a wrong id or an unknown role", () => {
    localStorage.setItem("ssb_auth_session_v1", JSON.stringify({ id: "x", name: "a", role: "worker" }));
    expect(readSession()).toBeNull();
    localStorage.setItem("ssb_auth_session_v1", JSON.stringify({ id: "x", name: "a", role: "admin" }));
    expect(readSession()).toBeNull();
  });
});

function Probe() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderGuarded(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          {["citizen", "worker", "official"].map((role) => (
            <Route
              key={role}
              path={`/${role}/*`}
              element={
                <RequireRole role={role}>
                  <p>{role} page</p>
                </RequireRole>
              }
            />
          ))}
        </Routes>
        <Probe />
      </AuthProvider>
    </MemoryRouter>
  );
}

const path = () => screen.getByTestId("path").textContent;

describe("RequireRole", () => {
  it.each(["citizen", "worker", "official"])("lets the %s role onto its own routes", async (role) => {
    acceptConsentForAll();
    startSession(role, "");
    renderGuarded(`/${role}`);
    expect(await screen.findByText(`${role} page`)).toBeInTheDocument();
  });

  it.each([
    ["citizen", ["/official", "/official/facility-requests", "/worker", "/worker/tasks"]],
    ["worker", ["/citizen", "/citizen/report", "/official", "/official/workers"]],
    ["official", ["/citizen", "/citizen/complaints", "/worker", "/worker/facility-request"]],
  ])("sends a %s on another role's routes back to their own home", async (role, others) => {
    acceptConsentForAll();
    startSession(role, "");
    for (const target of others) {
      const { unmount } = renderGuarded(target);
      expect(path()).toBe(ROLE_HOME[role]);
      expect(await screen.findByText(`${role} page`)).toBeInTheDocument();
      unmount();
    }
  });

  it.each(["/worker", "/official"])("sends a signed-out visitor on %s to the start screen", (target) => {
    renderGuarded(target);
    expect(path()).toBe("/login");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("a first visit to /citizen goes to the start screen and creates nothing", () => {
    renderGuarded("/citizen");
    expect(path()).toBe("/login");
    expect(readSession()).toBeNull();
  });

  it("an old 'Continue without account' session is signed out: /citizen goes to the start screen", () => {
    localStorage.setItem("ssb_auth_session_v1", JSON.stringify({ id: "fb-anon-1", name: "citizen", role: "citizen", method: "anonymous", email: null, loginAt: "2026-01-01T00:00:00.000Z" }));
    localStorage.setItem("ssb_continued_anon_v1", "1");
    renderGuarded("/citizen");
    expect(path()).toBe("/login");
    expect(readSession()).toBeNull();
  });

  it("an email citizen is kept off staff routes too", () => {
    acceptConsentForAll("fb-uid-9");
    startEmailSession({ uid: "fb-uid-9", email: "citizen@example.test" });
    renderGuarded("/official");
    expect(path()).toBe("/citizen");
  });

  it("the agreement given on this device before signing in is recorded for the account (no second consent screen)", async () => {
    startSession("official", "");
    renderGuarded("/official");
    expect(await screen.findByText("official page")).toBeInTheDocument();
    expect((await getConsentStatus()).upToDate).toBe(true);
  });

  it("a signed-in account that hasn't agreed to the privacy notice sees the consent screen, not the page", async () => {
    firstVisit(); // e.g. signed in by an earlier build, before the consent step existed
    startSession("official", "");
    renderGuarded("/official");
    expect(await screen.findByRole("button", { name: /continue/i })).toBeInTheDocument();
    expect(screen.queryByText("official page")).toBeNull();
    expect(path()).toBe("/official");
  });
});
