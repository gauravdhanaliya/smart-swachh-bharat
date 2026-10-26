import { describe, expect, it } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
import RequireRole from "../components/RequireRole";
import { DEMO_USERS, readSession, startSession } from "../services/authSession";
import { withProfiles } from "./renderApp";

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe("auth session", () => {
  it("role login creates the session { id, name, role, loginAt }", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login("citizen", "Asha");
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toMatchObject({ id: DEMO_USERS.citizen.id, name: "Asha", role: "citizen" });
    expect(Date.parse(result.current.user.loginAt)).not.toBeNaN();
    expect(readSession()).toEqual(result.current.user);
  });

  it("blank name falls back to the role's demo name", () => {
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

  it("worker signs in as the seeded demo worker w1", () => {
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

  it("refresh keeps the session (a fresh provider reads it back)", () => {
    startSession("worker", "Ravi");
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toMatchObject({ id: "w1", name: "Ravi", role: "worker" });
  });

  it("ignores a stored session with a wrong id or unknown role", () => {
    localStorage.setItem("ssb_auth_session_v1", JSON.stringify({ id: "x", name: "a", role: "worker" }));
    expect(readSession()).toBeNull();
    localStorage.setItem("ssb_auth_session_v1", JSON.stringify({ id: "x", name: "a", role: "admin" }));
    expect(readSession()).toBeNull();
  });
});

function renderGuarded(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/profile/setup" element={<p>profile setup</p>} />
          <Route path="/citizen" element={<RequireRole role="citizen"><p>citizen page</p></RequireRole>} />
          <Route path="/worker" element={<RequireRole role="worker"><p>worker page</p></RequireRole>} />
          <Route path="/official" element={<RequireRole role="official"><p>official page</p></RequireRole>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("RequireRole", () => {
  it.each(["citizen", "worker", "official"])("allows the %s role on its own route", (role) => {
    withProfiles(role);
    startSession(role);
    renderGuarded(`/${role}`);
    expect(screen.getByText(`${role} page`)).toBeInTheDocument();
  });

  it.each(["citizen", "worker", "official"])("sends a signed-in %s without a profile to setup", (role) => {
    startSession(role);
    renderGuarded(`/${role}`);
    expect(screen.getByText("profile setup")).toBeInTheDocument();
  });

  it.each([
    ["citizen", "/official"],
    ["citizen", "/worker"],
    ["worker", "/citizen"],
    ["worker", "/official"],
    ["official", "/citizen"],
    ["official", "/worker"],
  ])("redirects %s away from %s to /login", (role, path) => {
    withProfiles();
    startSession(role);
    renderGuarded(path);
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it.each(["/citizen", "/worker", "/official"])("redirects a logged-out visitor on %s to /login", (path) => {
    renderGuarded(path);
    expect(screen.getByText("login page")).toBeInTheDocument();
  });
});
