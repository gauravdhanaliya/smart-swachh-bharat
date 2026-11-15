// Feature 5a: consent. On a first visit the start screen asks before anything
// is created; an account without an agreement sees the consent screen.

import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));
vi.mock("../services/authService", () => ({
  logIn: vi.fn(async ({ email }) => ({ uid: "fresh-1", idToken: "t", email, emailVerified: true })),
  createAccount: vi.fn(),
  signOutUser: vi.fn(async () => {}),
}));

import App from "../App";
import { readSession, startEmailSession, startSession } from "../services/authSession";
import { clearConsentCache } from "../services/consentService";
import { DEFAULT_CONSENT_VERSION } from "../../server/src/constants.js";
import { LOCAL_CONSENT_KEY, acceptConsentLocally, firstVisit } from "../test/consent";
import { agreeToConsent, demoLogin, logInWith, loginCard } from "../test/loginPage";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { seedLocalApi } from "../test/fixtures";

function Path() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}
function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Path />
    </MemoryRouter>
  );
}
const path = () => screen.getByTestId("path").textContent;
const consentScreen = () => screen.findByRole("heading", { level: 1, name: "Before you start" });
const box = (name) => screen.getByRole("checkbox", { name });

const PHONE = /phone number/i;
const LOCATION = /location access when i report/i;
const PHOTOS = /photos i upload are attached/i;
const NOTICE = /i have read the privacy notice/i;

beforeEach(() => {
  seedLocalApi();
  clearConsentCache();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => vi.unstubAllGlobals());

describe("first visit: consent before anything is created", () => {
  beforeEach(() => firstVisit());

  it("the start route asks for consent first; Agree stays disabled until every box is ticked", async () => {
    renderApp("/");
    await consentScreen();
    expect(path()).toBe("/login");
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.queryByRole("checkbox", { name: PHONE })).toBeNull(); // no phone sign-in any more
    expect(screen.queryByRole("button", { name: /continue without account/i })).toBeNull();
    const go = screen.getByRole("button", { name: "Agree and continue" });
    expect(go).toBeDisabled();
    await userEvent.click(box(LOCATION));
    await userEvent.click(box(PHOTOS));
    expect(go).toBeDisabled();
    await userEvent.click(box(NOTICE));
    expect(go).toBeEnabled();
  });

  it("nothing is created before consent: no session, no account id, no consent record, no request", async () => {
    renderApp("/citizen/report"); // even a deep link
    await consentScreen();
    expect(path()).toBe("/login");
    expect(readSession()).toBeNull();
    expect(localStorage.getItem(LOCAL_CONSENT_KEY)).toBeNull();
    expect(localStorage.getItem("ssb_local_citizen_id_v1")).toBeNull();
    expect(Object.keys(localStorage).filter((k) => !k.startsWith("ssb_local_api"))).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("after agreeing, the login card and Try the demo show; logging in opens the citizen Home with the agreement recorded", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await agreeToConsent(user);
    expect(await loginCard()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^try the demo$/i })).toBeInTheDocument();
    expect(screen.queryByText(/continue without account/i)).toBeNull();
    expect(readSession()).toBeNull(); // still nothing created
    await logInWith(user);
    await waitFor(() => expect(path()).toBe("/citizen"));
    expect(screen.queryByRole("heading", { level: 1, name: "Before you start" })).toBeNull(); // not asked twice
    const saved = JSON.parse(localStorage.getItem(LOCAL_CONSENT_KEY))[readSession().id];
    expect(saved).toMatchObject({ version: DEFAULT_CONSENT_VERSION, items: { locationWhenReporting: true, photosAttached: true, readNotice: true } });
    expect(saved.items.phoneForLogin).toBeUndefined();
    expect(saved.acceptedAt).toEqual(expect.any(String));
  });

  it("a demo login comes after the same consent step, and isn't asked again", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    await agreeToConsent(user);
    await demoLogin(user, /government official/i);
    await waitFor(() => expect(path()).toBe("/official"));
    expect(readSession()).toMatchObject({ role: "official" });
    expect(screen.queryByRole("heading", { level: 1, name: "Before you start" })).toBeNull();
  });

  it("the sign-in functions themselves refuse without consent (no account is made)", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider> });
    expect(result.current.startAsCitizen).toBeUndefined(); // there is no way in without an account
    await expect(result.current.logInWithEmail({ email: "a@example.test", password: "s3cret-pass" })).rejects.toMatchObject({ code: "consent/required" });
    await expect(result.current.createAccount({ email: "a@example.test", password: "s3cret-pass" })).rejects.toMatchObject({ code: "consent/required" });
    expect(() => result.current.login("official")).toThrow(/privacy notice/i);
    expect(readSession()).toBeNull();
  });
});

describe("the consent screen after sign-in (an account with no agreement yet)", () => {
  beforeEach(() => firstVisit());

  it("the summary names the email account at Firebase; no anonymous account, no phone number", async () => {
    startEmailSession({ uid: "anon-consent", email: "citizen@example.test" });
    renderApp("/citizen");
    await consentScreen();
    expect(screen.getByText(/your account: your email and password, at firebase authentication/i)).toBeInTheDocument();
    expect(screen.queryByText(/anonymous/i)).toBeNull();
    expect(screen.queryByText(/otp|one-time code|continue without account/i)).toBeNull();
  });

  it("worker and official pages are gated the same way", async () => {
    startSession("official", "");
    renderApp("/official");
    await consentScreen();
    expect(path()).toBe("/official");
  });

  it("links to the full privacy notice", async () => {
    startSession("citizen", "");
    renderApp("/citizen");
    await consentScreen();
    expect(screen.getByRole("link", { name: /read the privacy notice/i })).toHaveAttribute("href", "/privacy");
  });

  it("Sign out instead leaves without agreeing", async () => {
    startSession("citizen", "");
    renderApp("/citizen");
    await consentScreen();
    await userEvent.click(screen.getByRole("button", { name: "Sign out instead" }));
    expect(path()).toBe("/login");
    expect(localStorage.getItem(LOCAL_CONSENT_KEY)).toBeNull();
  });
});

describe("after agreeing", () => {
  beforeEach(() => firstVisit());
  it("the same account isn't asked again; another account is", async () => {
    acceptConsentLocally(startSession("citizen", ""));
    const first = renderApp("/citizen");
    expect(await screen.findByRole("heading", { level: 1, name: /^Hello/ })).toBeInTheDocument();
    first.unmount();
    clearConsentCache();
    startSession("worker", "");
    renderApp("/worker");
    await consentScreen();
  });

  it("a changed privacy notice (new version) asks again, and says why", async () => {
    acceptConsentLocally(startSession("citizen", ""), DEFAULT_CONSENT_VERSION - 1);
    renderApp("/citizen");
    await consentScreen();
    expect(screen.getByRole("status")).toHaveTextContent(/privacy notice has changed/i);
  });
});

describe("the consent screen itself", () => {
  beforeEach(() => firstVisit());
  it("summarises where data goes, including OpenStreetMap Nominatim", async () => {
    startSession("citizen", "");
    renderApp("/citizen");
    await consentScreen();
    const summary = screen.getByRole("list", { name: /where your data goes/i });
    expect(within(summary).getByText(/nominatim/i)).toBeInTheDocument();
    expect(within(summary).getAllByText(/firebase/i)).toHaveLength(1); // the email account
  });
});
