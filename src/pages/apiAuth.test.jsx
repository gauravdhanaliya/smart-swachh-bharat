// The app signed in through the EcoSetu API (VITE_USE_API=true), against a
// fake server with the real server's refresh-token rules.

import { StrictMode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));
vi.mock("../services/authService", () => ({
  RECAPTCHA_CONTAINER_ID: "recaptcha-container",
  sendOtp: vi.fn(),
  confirmOtp: vi.fn(),
  signOutUser: vi.fn(),
  resetPendingOtp: vi.fn(),
}));

import App from "../App";
import { confirmOtp, sendOtp, signOutUser } from "../services/authService";
import { SESSION_EXPIRED_MESSAGE, getSessionClient, resetSessionClientForTests } from "../services/session";
import { createFakeAuthServer } from "../test/fakeAuthServer";

let server;

function Probe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}
const path = () => screen.getByTestId("path").textContent;

function renderApp(at, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[at]}>
      <App />
      <Probe />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  vi.stubEnv("VITE_USE_API", "true");
  server = createFakeAuthServer();
  resetSessionClientForTests({ fetch: server.fetch, locks: null, createChannel: () => null });
  // OpenStreetMap lookups by the map screens: no network in tests.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  sendOtp.mockReset().mockResolvedValue();
  confirmOtp.mockReset();
  signOutUser.mockReset().mockResolvedValue();
});

afterEach(() => {
  resetSessionClientForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("page load", () => {
  it("restores the session with exactly one /refresh, even under StrictMode", async () => {
    server.signInEarlier("demo-citizen");
    renderApp("/citizen", { strict: true });
    expect(screen.getByRole("status")).toHaveTextContent(/restoring your session/i);
    expect(await screen.findByRole("heading", { name: /citizen!/i })).toBeInTheDocument();
    expect(path()).toBe("/citizen");
    expect(server.count("/api/auth/refresh")).toBe(1);
    expect(server.hasLiveSession()).toBe(true);
  });

  it("with no session it shows the login page, without an error", async () => {
    renderApp("/citizen", { strict: true });
    expect(await screen.findByRole("region", { name: /demo login/i })).toBeInTheDocument();
    expect(path()).toBe("/login");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(server.count("/api/auth/refresh")).toBe(1);
  });

  it("a session that can no longer be restored shows the login page with a clear message", async () => {
    server.signInEarlier("demo-official");
    localStorage.setItem("ssb_session_hint_v1", "1"); // this browser was signed in before
    server.revokeEverything();
    renderApp("/official");
    expect(await screen.findByRole("alert")).toHaveTextContent(SESSION_EXPIRED_MESSAGE);
    expect(path()).toBe("/login");
  });

  it("a server that can't be reached shows a message, not a blank page", async () => {
    server.signInEarlier("demo-citizen");
    server.setOffline(true);
    renderApp("/citizen");
    expect(await screen.findByRole("alert")).toHaveTextContent(/network problem/i);
    expect(path()).toBe("/login");
  });
});

describe("while signed in", () => {
  it("a refresh that fails mid-session clears the token and sends the user to login with a message", async () => {
    server.signInEarlier("demo-citizen");
    renderApp("/citizen/profile");
    expect(await screen.findByText("Demo Citizen")).toBeInTheDocument();

    server.revokeEverything();
    await act(async () => {
      await expect(getSessionClient().request("/api/data")).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    });
    await waitFor(() => expect(path()).toBe("/login"));
    expect(screen.getByRole("alert")).toHaveTextContent(SESSION_EXPIRED_MESSAGE);
    expect(getSessionClient().getAccessToken()).toBeNull();
  });

  it("parallel requests that all get a 401 share one refresh, and the user stays signed in", async () => {
    server.signInEarlier("demo-worker");
    renderApp("/worker");
    await waitFor(() => expect(path()).toBe("/worker"));
    server.expireAccessTokens();
    const before = server.count("/api/auth/refresh");
    await act(async () => {
      const results = await Promise.all(Array.from({ length: 4 }, () => getSessionClient().request("/api/data")));
      expect(results.every((r) => r.ok)).toBe(true);
    });
    expect(server.count("/api/auth/refresh") - before).toBe(1);
    expect(path()).toBe("/worker");
    expect(server.hasLiveSession()).toBe(true);
  });

  it("the role comes from the server: a demo citizen can't open a government page", async () => {
    server.signInEarlier("demo-citizen");
    renderApp("/official/complaints");
    await waitFor(() => expect(path()).toBe("/citizen"));
  });

  it("logging out calls the server and returns to the login page without an error", async () => {
    server.signInEarlier("demo-citizen");
    const user = userEvent.setup();
    renderApp("/citizen/profile");
    await user.click(await screen.findByRole("button", { name: /^logout$/i }));
    await user.click(screen.getByRole("button", { name: /^log out$/i }));
    await waitFor(() => expect(path()).toBe("/login"));
    expect(server.count("/api/auth/logout")).toBe(1);
    expect(server.hasLiveSession()).toBe(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(signOutUser).not.toHaveBeenCalled(); // a demo session has no Firebase sign-in
  });
});

describe("logging in", () => {
  it.each([
    [/^citizen/i, "citizen", "/citizen"],
    [/sanitation worker/i, "worker", "/worker"],
    [/government official/i, "official", "/official"],
  ])("the demo card %s signs in through /api/auth/demo, sending only the role", async (card, role, home) => {
    const user = userEvent.setup();
    renderApp("/login");
    const demo = await screen.findByRole("region", { name: /demo login/i });
    // demo accounts have fixed names on the server, so there is nothing to type
    expect(within(demo).queryByLabelText(/your name/i)).not.toBeInTheDocument();
    await user.click(within(demo).getByRole("button", { name: card }));
    await waitFor(() => expect(path()).toBe(home));
    const call = server.calls.find((c) => c.path === "/api/auth/demo");
    expect(call.body).toEqual({ role });
  });

  it("a server with the demo login switched off says so", async () => {
    const off = createFakeAuthServer();
    const offFetch = (url, init) => (String(url).endsWith("/api/auth/demo") ? Promise.resolve({ ok: false, status: 404, json: async () => ({ error: "Not found." }) }) : off.fetch(url, init));
    resetSessionClientForTests({ fetch: offFetch, locks: null, createChannel: () => null });
    const user = userEvent.setup();
    renderApp("/login");
    await user.click(await screen.findByRole("button", { name: /government official/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/demo login is switched off/i);
    expect(path()).toBe("/login");
  });

  it("phone login sends the Firebase ID token to /api/auth/firebase and opens the citizen dashboard", async () => {
    confirmOtp.mockResolvedValue({ uid: "fb-user", idToken: "good-firebase-id-token" });
    const user = userEvent.setup();
    renderApp("/login");
    await user.type(await screen.findByLabelText(/mobile number/i), "9876543210");
    await user.click(screen.getByRole("button", { name: /send otp/i }));
    await user.type(screen.getByLabelText(/^otp$/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(path()).toBe("/citizen"));
    expect(server.calls.find((c) => c.path === "/api/auth/firebase").body).toEqual({ idToken: "good-firebase-id-token" });
    expect(JSON.stringify({ ...localStorage })).not.toContain("good-firebase-id-token");
  });

  it("a phone login the server refuses shows the server's reason", async () => {
    confirmOtp.mockResolvedValue({ uid: "x", idToken: "bad-token" });
    const user = userEvent.setup();
    renderApp("/login");
    await user.type(await screen.findByLabelText(/mobile number/i), "9876543210");
    await user.click(screen.getByRole("button", { name: /send otp/i }));
    await user.type(screen.getByLabelText(/^otp$/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/phone verification failed/i);
    expect(path()).toBe("/login");
  });
});
