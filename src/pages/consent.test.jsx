// Feature 5a: the first-login consent screen, for phone and demo logins.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));

import App from "../App";
import { startOtpSession, startSession } from "../services/authSession";
import { clearConsentCache } from "../services/consentService";
import { DEFAULT_CONSENT_VERSION } from "../../server/src/constants.js";
import { LOCAL_CONSENT_KEY, acceptConsentLocally } from "../test/consent";
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

const PHONE = /phone number for login/i;
const LOCATION = /location access when i report/i;
const PHOTOS = /photos i upload are attached/i;
const NOTICE = /i have read the privacy notice/i;

beforeEach(() => {
  seedLocalApi();
  clearConsentCache();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => vi.unstubAllGlobals());

describe("first login", () => {
  it("demo login shows the consent screen first; Continue stays disabled until every required box is ticked", async () => {
    renderApp("/login");
    await userEvent.click(await screen.findByRole("button", { name: /^citizen/i }));
    await consentScreen();
    expect(screen.queryByRole("checkbox", { name: PHONE })).toBeNull(); // demo accounts have no phone
    const go = screen.getByRole("button", { name: "Agree and continue" });
    expect(go).toBeDisabled();
    await userEvent.click(box(LOCATION));
    await userEvent.click(box(PHOTOS));
    expect(go).toBeDisabled();
    await userEvent.click(box(NOTICE));
    expect(go).toBeEnabled();
    await userEvent.click(go);
    expect(await screen.findByRole("heading", { name: /citizen!/i })).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(LOCAL_CONSENT_KEY))["demo-citizen"];
    expect(saved).toMatchObject({ version: DEFAULT_CONSENT_VERSION, items: { locationWhenReporting: true, photosAttached: true, readNotice: true, phoneForLogin: false } });
    expect(saved.acceptedAt).toEqual(expect.any(String));
  });

  it("phone login: the phone box is shown and required too", async () => {
    startOtpSession({ uid: "otp-user", phone: "9876543210" });
    renderApp("/citizen");
    await consentScreen();
    for (const name of [LOCATION, PHOTOS, NOTICE]) await userEvent.click(box(name));
    expect(screen.getByRole("button", { name: "Agree and continue" })).toBeDisabled();
    await userEvent.click(box(PHONE));
    await userEvent.click(screen.getByRole("button", { name: "Agree and continue" }));
    expect(await screen.findByRole("heading", { name: /citizen!/i })).toBeInTheDocument();
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
  it("the same account isn't asked again; another account is", async () => {
    acceptConsentLocally(startSession("citizen", ""));
    const first = renderApp("/citizen");
    expect(await screen.findByRole("heading", { name: /citizen!/i })).toBeInTheDocument();
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
  it("summarises where data goes, including OpenStreetMap Nominatim", async () => {
    startSession("citizen", "");
    renderApp("/citizen");
    await consentScreen();
    const summary = screen.getByRole("list", { name: /where your data goes/i });
    expect(within(summary).getByText(/nominatim/i)).toBeInTheDocument();
    expect(within(summary).getByText(/firebase/i)).toBeInTheDocument();
  });
});
