// The start screen. A first visit asks for consent (consent.test.jsx); then
// the card is the email login itself: Log in, Forgot password?, Create
// account (a new account is a citizen at once, asked to verify its email by
// a banner). "Try the demo" opens the three demo roles where the demo login
// is on. There is no anonymous sign-in. The profile shows the account,
// changes the password, and logs out.

import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll, firstVisit } from "../test/consent";
import { agreeToConsent, demoLogin, logInWith, loginCard, openDemoSheet } from "../test/loginPage";

// Leaflet needs a real layout engine; the map itself is not under test here.
vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));

vi.mock("../services/authService", () => ({
  logIn: vi.fn(),
  createAccount: vi.fn(),
  sendPasswordReset: vi.fn(),
  refreshAccount: vi.fn(),
  resendVerification: vi.fn(),
  changePassword: vi.fn(),
  verifyPassword: vi.fn(),
  deleteFirebaseAccount: vi.fn(),
  firebaseAvailable: vi.fn(async () => true),
  signOutUser: vi.fn(),
}));

import App from "../App";
import * as authService from "../services/authService";
import { readSession, startEmailSession, startSession } from "../services/authSession";

function Probe() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderApp(path = "/", { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Probe />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const path = () => screen.getByTestId("path").textContent;
const authError = (code) => Object.assign(new Error(code), { code });
const account = (uid, email = "asha@example.test", verified = true) => ({ uid, idToken: `t-${uid}`, email, emailVerified: verified });

beforeEach(() => {
  acceptConsentForAll("saved-9", "new-5", "me-1"); // the consent screen has its own tests (consent.test.jsx)
  for (const fn of Object.values(authService)) fn.mockReset?.();
  authService.sendPasswordReset.mockResolvedValue();
  authService.resendVerification.mockResolvedValue();
  authService.signOutUser.mockResolvedValue();
  authService.firebaseAvailable.mockResolvedValue(true);
});

describe("start screen", () => {
  it("is the email login form itself: email, password, Log in, Forgot password?, Create account; no anonymous way in", async () => {
    renderApp("/");
    await waitFor(() => expect(path()).toBe("/login"));
    expect(await screen.findByRole("heading", { level: 1, name: /smart swachh bharat/i })).toBeInTheDocument();
    const card = await loginCard();
    expect(within(card).getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(within(card).getByLabelText(/^email$/i)).toHaveAttribute("autocomplete", "email");
    expect(within(card).getByLabelText(/^password$/i)).toHaveAttribute("autocomplete", "current-password");
    expect(within(card).getByRole("button", { name: /^log in$/i })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /forgot password/i })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /create account/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // not a sheet
    expect(screen.queryByText(/continue without account|continue as citizen/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mobile number|otp/i)).not.toBeInTheDocument();
    expect(screen.getByText("Hackathon prototype, not an official government service")).toBeInTheDocument();
    // "Try the demo" is an outlined button inside the card
    expect(within(card).getByRole("button", { name: /^try the demo$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
  });

  it("every page, signed out, goes to the start screen and signs nothing in", () => {
    for (const target of ["/citizen", "/citizen/map", "/worker", "/official"]) {
      const { unmount } = renderApp(target);
      expect(path()).toBe("/login");
      unmount();
    }
    expect(authService.logIn).not.toHaveBeenCalled();
    expect(readSession()).toBeNull();
  });

  it.each(["/citizen", "/citizen/map", "/citizen/report"])("signed out, %s shows the start screen's login card (nothing of the page)", async (target) => {
    renderApp(target);
    expect(await loginCard()).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("logs in and goes to the home the server's role gives (a citizen here)", async () => {
    authService.logIn.mockResolvedValue(account("saved-9"));
    const user = userEvent.setup();
    renderApp("/login");
    await logInWith(user, "asha@example.test", "s3cret-pass");
    expect(authService.logIn).toHaveBeenCalledWith({ email: "asha@example.test", password: "s3cret-pass" });
    await waitFor(() => expect(path()).toBe("/citizen"));
    expect(readSession()).toMatchObject({ id: "saved-9", role: "citizen", method: "email", email: "as***@e***.test" });
  });

  it("under StrictMode a double tap logs in once", async () => {
    authService.logIn.mockResolvedValue(account("saved-9"));
    const user = userEvent.setup();
    renderApp("/login", { strict: true });
    const card = await loginCard();
    await user.type(within(card).getByLabelText(/^email$/i), "asha@example.test");
    await user.type(within(card).getByLabelText(/^password$/i), "s3cret-pass");
    const button = within(card).getByRole("button", { name: /^log in$/i });
    await user.click(button);
    await user.click(button).catch(() => {});
    await waitFor(() => expect(path()).toBe("/citizen"));
    expect(authService.logIn).toHaveBeenCalledTimes(1);
  });

  it("checks the fields first: errors under each field, and nothing is sent", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    const card = await loginCard();
    await user.type(within(card).getByLabelText(/^email$/i), "not-an-email");
    await user.click(within(card).getByRole("button", { name: /^log in$/i }));
    expect(within(card).getByLabelText(/^email$/i)).toHaveAttribute("aria-invalid", "true");
    expect(within(card).getByLabelText(/^email$/i)).toHaveAccessibleDescription(/valid email/i);
    expect(within(card).getByLabelText(/^password$/i)).toHaveAccessibleDescription(/enter your password/i);
    expect(authService.logIn).not.toHaveBeenCalled();
  });

  it("a wrong password and an unknown email get the same message", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    const card = await loginCard();
    const messages = [];
    for (const code of ["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"]) {
      authService.logIn.mockRejectedValueOnce(authError(code));
      await user.clear(within(card).getByLabelText(/^email$/i));
      await user.type(within(card).getByLabelText(/^email$/i), "asha@example.test");
      await user.clear(within(card).getByLabelText(/^password$/i));
      await user.type(within(card).getByLabelText(/^password$/i), "nope-nope");
      await user.click(within(card).getByRole("button", { name: /^log in$/i }));
      messages.push((await within(card).findByRole("alert")).textContent);
    }
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toMatch(/email or password is wrong/i);
    expect(readSession()).toBeNull();
  });

  it("without Firebase in this build, logging in says so and points to the demo", async () => {
    authService.logIn.mockRejectedValue(authError("auth/not-configured"));
    const user = userEvent.setup();
    renderApp("/login");
    await logInWith(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/aren't set up on this build.*demo/i);
  });
});

describe("create account", () => {
  const openCreate = async (user) => {
    const card = await loginCard();
    await user.click(within(card).getByRole("button", { name: /create account/i }));
    return screen.findByRole("region", { name: "Create account" });
  };

  it("makes a citizen who can use the app at once, and asks them to verify their email", async () => {
    authService.createAccount.mockResolvedValue({ ...account("new-5", "new@example.test", false), verificationSent: true });
    const user = userEvent.setup();
    renderApp("/login");
    const card = await openCreate(user);
    expect(within(card).getByLabelText(/choose a password/i)).toHaveAttribute("autocomplete", "new-password");
    expect(within(card).getByLabelText(/choose a password/i)).toHaveAccessibleDescription(/at least 8 characters/i);
    await user.type(within(card).getByLabelText(/^email$/i), "new@example.test");
    await user.type(within(card).getByLabelText(/choose a password/i), "s3cret-pass");
    await user.click(within(card).getByRole("button", { name: /^create account$/i }));
    expect(authService.createAccount).toHaveBeenCalledWith({ email: "new@example.test", password: "s3cret-pass" });
    await waitFor(() => expect(path()).toBe("/citizen"));
    expect(readSession()).toMatchObject({ id: "new-5", role: "citizen", method: "email", emailVerified: false });
    const banner = await screen.findByRole("region", { name: /verify your email/i });
    expect(banner).toHaveTextContent("ne***@e***.test");
  });

  it("with an email that already has an account, doesn't say so", async () => {
    authService.createAccount.mockRejectedValue(authError("auth/account-not-created"));
    const user = userEvent.setup();
    renderApp("/login");
    const card = await openCreate(user);
    await user.type(within(card).getByLabelText(/^email$/i), "taken@example.test");
    await user.type(within(card).getByLabelText(/choose a password/i), "s3cret-pass");
    await user.click(within(card).getByRole("button", { name: /^create account$/i }));
    const alert = await within(card).findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't use that email for a new account/i);
    expect(alert.textContent).not.toMatch(/already (has|exists|registered|in use)|taken/i);
    expect(readSession()).toBeNull();
  });

  it("asks for 8+ characters before sending anything", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    const card = await openCreate(user);
    await user.type(within(card).getByLabelText(/^email$/i), "new@example.test");
    await user.type(within(card).getByLabelText(/choose a password/i), "short");
    await user.click(within(card).getByRole("button", { name: /^create account$/i }));
    expect(within(card).getByLabelText(/choose a password/i)).toHaveAccessibleDescription(/use at least 8 characters/i);
    expect(authService.createAccount).not.toHaveBeenCalled();
  });
});

describe("forgot password", () => {
  it("sends the link and shows the same confirmation for any email, then goes back to log in", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    await user.click(within(await loginCard()).getByRole("button", { name: /forgot password/i }));
    const card = await screen.findByRole("region", { name: /reset your password/i });
    await user.type(within(card).getByLabelText(/^email$/i), "anyone@example.test");
    await user.click(within(card).getByRole("button", { name: /send reset link/i }));
    expect(authService.sendPasswordReset).toHaveBeenCalledWith("anyone@example.test");
    const sent = await screen.findByRole("region", { name: /check your inbox/i });
    expect(within(sent).getByRole("status")).toHaveTextContent(/if anyone@example.test has an ecosetu account/i);
    await user.click(within(sent).getByRole("button", { name: /back to log in/i }));
    expect(await screen.findByRole("region", { name: "Log in" })).toBeInTheDocument();
  });
});

describe("Verify your email banner", () => {
  const unverified = () => startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: false });

  it("shows until the email is verified, can resend the email, and picks up 'verified'", async () => {
    unverified();
    authService.refreshAccount.mockResolvedValue(account("me-1", "asha@example.test", true));
    const user = userEvent.setup();
    renderApp("/citizen");
    const banner = await screen.findByRole("region", { name: /verify your email/i });
    await user.click(within(banner).getByRole("button", { name: /resend email/i }));
    expect(authService.resendVerification).toHaveBeenCalled();
    expect(await within(banner).findByText(/sent again/i)).toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: /i've verified it/i }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /verify your email/i })).not.toBeInTheDocument());
    expect(readSession().emailVerified).toBe(true);
  });

  it("can be dismissed for this session", async () => {
    unverified();
    const user = userEvent.setup();
    const { unmount } = renderApp("/citizen");
    await user.click(within(await screen.findByRole("region", { name: /verify your email/i })).getByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /verify your email/i })).not.toBeInTheDocument());
    unmount();
    renderApp("/citizen/map");
    await screen.findByTestId("path");
    expect(screen.queryByRole("region", { name: /verify your email/i })).not.toBeInTheDocument();
  });

  it("isn't shown to a verified account or a demo account", async () => {
    startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: true });
    const first = renderApp("/citizen");
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /verify your email/i })).not.toBeInTheDocument();
    first.unmount();
    startSession("citizen", "");
    renderApp("/citizen");
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /verify your email/i })).not.toBeInTheDocument();
  });
});

describe("try the demo", () => {
  it("opens a sheet with Citizen, Sanitation Worker and Government Official", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    const sheet = await openDemoSheet(user);
    expect(sheet).toHaveAttribute("aria-modal", "true");
    const rows = within(sheet).getAllByRole("button").filter((b) => b.getAttribute("aria-label") !== "Close");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/^Citizen/), expect.stringMatching(/^Sanitation Worker/), expect.stringMatching(/^Government Official/)]);
    expect(within(sheet).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it.each([
    [/^citizen/i, "citizen", "/citizen"],
    [/sanitation worker/i, "worker", "/worker"],
    [/government official/i, "official", "/official"],
  ])("signs in through the %s row", async (row, role, home) => {
    const user = userEvent.setup();
    renderApp("/login");
    await demoLogin(user, row);
    await waitFor(() => expect(path()).toBe(home));
    expect(readSession()).toMatchObject({ role, method: "demo" });
    expect(authService.logIn).not.toHaveBeenCalled();
  });

  it("closes on Escape and gives focus back to the link", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    await openDemoSheet(user);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /^try the demo$/i })).toHaveFocus());
  });

  it("keeps keyboard focus inside the sheet", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    const sheet = await openDemoSheet(user);
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    const focusable = within(sheet).getAllByRole("button");
    for (let i = 0; i < focusable.length * 2 + 1; i += 1) {
      await user.tab();
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
    focusable[0].focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(focusable.at(-1));
  });
});

describe("profile: your account", () => {
  const section = () => screen.findByRole("region", { name: /your account/i });

  it("shows the masked email and whether it is verified; no 'Save my account'", async () => {
    startEmailSession({ uid: "me-1", email: "asha.verma@example.test", emailVerified: false });
    renderApp("/citizen/profile");
    const s = await section();
    expect(within(s).getByText(/signed in as/i)).toHaveTextContent("Signed in as as***@e***.test · not verified yet");
    expect(within(s).queryByRole("form", { name: /save my account/i })).not.toBeInTheDocument();
    expect(within(s).queryByText(/save my account|log in to a saved account/i)).not.toBeInTheDocument();
  });

  it("changes the password: current first, then a new one of 8+ characters", async () => {
    startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: true });
    authService.changePassword.mockResolvedValue();
    const user = userEvent.setup();
    renderApp("/citizen/profile");
    const s = await section();
    await user.click(within(s).getByRole("button", { name: /^change password$/i }));
    const form = within(s).getByRole("form", { name: /change password/i });
    const submit = within(form).getByRole("button", { name: /^change password$/i });
    await user.type(within(form).getByLabelText(/current password/i), "old-pass-1");
    await user.type(within(form).getByLabelText(/^new password$/i), "short");
    expect(submit).toBeDisabled();
    await user.type(within(form).getByLabelText(/^new password$/i), "-and-long");
    await user.click(submit);
    expect(authService.changePassword).toHaveBeenCalledWith({ current: "old-pass-1", next: "short-and-long" });
    expect(await within(form).findByText("Password changed.")).toBeInTheDocument();
  });

  it("a wrong current password is explained", async () => {
    startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: true });
    authService.changePassword.mockRejectedValue(authError("auth/invalid-credential"));
    const user = userEvent.setup();
    renderApp("/citizen/profile");
    const s = await section();
    await user.click(within(s).getByRole("button", { name: /^change password$/i }));
    const form = within(s).getByRole("form", { name: /change password/i });
    await user.type(within(form).getByLabelText(/current password/i), "wrong-one");
    await user.type(within(form).getByLabelText(/^new password$/i), "new-pass-22");
    await user.click(within(form).getByRole("button", { name: /^change password$/i }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(/email or password is wrong/i);
  });

  it("an optional name can be set (and cleared back to anonymous)", async () => {
    startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: true });
    const user = userEvent.setup();
    renderApp("/citizen/profile");
    const s = await section();
    const name = within(s).getByLabelText(/name/i);
    expect(name).toHaveValue("");
    await user.type(name, "Asha");
    await user.click(within(s).getByRole("button", { name: /^save$/i }));
    expect(await within(s).findByText("Name saved.")).toBeInTheDocument();
    expect(readSession().name).toBe("Asha");
    await user.clear(name);
    await user.click(within(s).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(readSession().name).toBe("citizen"));
  });
});

describe("role guard for citizens", () => {
  it.each(["/worker", "/worker/tasks", "/official", "/official/complaints", "/official/workers"])("sends a citizen away from %s", async (target) => {
    startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: true });
    renderApp(target);
    await waitFor(() => expect(path()).toBe("/citizen"));
  });

  it("treats a citizen session edited to a staff role as signed out", () => {
    startEmailSession({ uid: "me-1", email: "asha@example.test" });
    const key = "ssb_auth_session_v1";
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), role: "official" }));
    renderApp("/official");
    expect(path()).toBe("/login");
  });
});

describe("logout", () => {
  async function logoutFromProfile(user) {
    await user.click(await screen.findByRole("button", { name: /^logout$/i }));
    expect(screen.getByText(/you can log back in with your email and password/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^log out$/i }));
  }

  it("signs out of Firebase, clears the session and this device's agreement (the next person is asked again)", async () => {
    startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: true });
    const user = userEvent.setup();
    renderApp("/citizen/profile");
    await logoutFromProfile(user);
    expect(authService.signOutUser).toHaveBeenCalledTimes(1);
    expect(readSession()).toBeNull();
    await waitFor(() => expect(path()).toBe("/login"));
    expect(await screen.findByRole("heading", { level: 1, name: "Before you start" })).toBeInTheDocument();
  });

  it("clears a demo session without calling Firebase", async () => {
    startSession("citizen", "Asha");
    const user = userEvent.setup();
    renderApp("/citizen/profile");
    await user.click(await screen.findByRole("button", { name: /^logout$/i }));
    await user.click(screen.getByRole("button", { name: /^log out$/i }));
    expect(authService.signOutUser).not.toHaveBeenCalled();
    expect(readSession()).toBeNull();
    await waitFor(() => expect(path()).toBe("/login"));
  });
});

describe("a first visit", () => {
  it("shows the consent step first, then the login card; nothing is sent before", async () => {
    firstVisit();
    const user = userEvent.setup();
    renderApp("/");
    await agreeToConsent(user);
    expect(await loginCard()).toBeInTheDocument();
    expect(authService.logIn).not.toHaveBeenCalled();
  });
});
