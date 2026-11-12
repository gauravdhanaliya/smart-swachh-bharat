import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll } from "../test/consent";

// Leaflet needs a real layout engine; the map itself is not under test here.
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
import { readSession, startOtpSession, startSession } from "../services/authSession";

function Probe() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderApp(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Probe />
    </MemoryRouter>
  );
}

const path = () => screen.getByTestId("path").textContent;
const phoneInput = () => screen.getByLabelText(/mobile number/i);
const otpInput = () => screen.getByLabelText(/^otp$/i);

async function requestOtp(user, number = "9876543210") {
  await user.type(phoneInput(), number);
  await user.click(screen.getByRole("button", { name: /send otp/i }));
}

beforeEach(() => {
  acceptConsentForAll("fb-uid-1"); // the consent screen has its own tests (consent.test.jsx)
  sendOtp.mockReset().mockResolvedValue();
  confirmOtp.mockReset().mockResolvedValue({ uid: "fb-uid-1" });
  signOutUser.mockReset().mockResolvedValue();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("login page", () => {
  it("shows phone OTP login and a clearly labelled demo login", () => {
    renderApp();
    const otp = screen.getByRole("region", { name: /login with phone/i });
    const demo = screen.getByRole("region", { name: /demo login/i });
    expect(within(otp).getByText("+91")).toBeInTheDocument();
    expect(within(otp).getByRole("button", { name: /send otp/i })).toBeInTheDocument();
    expect(within(demo).getByText(/pick a role/i)).toBeInTheDocument();
    for (const role of [/citizen/i, /sanitation worker/i, /government official/i]) {
      expect(within(demo).getByRole("button", { name: role })).toBeInTheDocument();
    }
    // The OTP option offers no role choice at all.
    expect(within(otp).queryByRole("button", { name: /worker|official/i })).not.toBeInTheDocument();
  });
});

describe("phone OTP login", () => {
  it("blocks sending for an invalid phone number", async () => {
    const user = userEvent.setup();
    renderApp();
    for (const bad of ["12345", "5876543210"]) {
      await user.clear(phoneInput());
      await user.type(phoneInput(), bad);
      await user.click(screen.getByRole("button", { name: /send otp/i }));
      expect(screen.getByRole("alert")).toHaveTextContent(/valid 10 digit/i);
    }
    expect(sendOtp).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/^otp$/i)).not.toBeInTheDocument();
  });

  it("only lets digits into the phone field, up to 10", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.type(phoneInput(), "98a7 6-54321099");
    expect(phoneInput()).toHaveValue("9876543210");
  });

  it("signs a verified user in as a citizen and opens the citizen dashboard", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    expect(sendOtp).toHaveBeenCalledWith("9876543210");
    expect(screen.getByText(/\+91 98XXXXXX10/)).toBeInTheDocument();

    await user.type(otpInput(), "123456");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    expect(await screen.findByRole("heading", { name: /citizen!/i })).toBeInTheDocument();
    expect(path()).toBe("/citizen");
    expect(confirmOtp).toHaveBeenCalledWith("123456");
    expect(readSession()).toMatchObject({ id: "fb-uid-1", role: "citizen", method: "otp", phone: "+91 98XXXXXX10" });
    // Nothing sensitive is left in storage.
    const everything = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(everything).not.toContain("123456");
    expect(everything).not.toContain("9876543210");
  });

  it("blocks verifying an OTP that is not 6 digits", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await user.type(otpInput(), "123");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/6 digit/i);
    expect(confirmOtp).not.toHaveBeenCalled();
  });

  it("shows an error for a wrong OTP and stays on the login page", async () => {
    confirmOtp.mockRejectedValue({ code: "auth/invalid-verification-code" });
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await user.type(otpInput(), "000000");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect/i);
    expect(path()).toBe("/login");
    expect(readSession()).toBeNull();
  });

  it.each([
    ["auth/code-expired", /expired/i],
    ["auth/too-many-requests", /too many attempts/i],
    ["auth/network-request-failed", /network/i],
  ])("shows a clear error when verifying fails with %s", async (code, message) => {
    confirmOtp.mockRejectedValue({ code });
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await user.type(otpInput(), "123456");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(readSession()).toBeNull();
  });

  it.each([
    ["auth/too-many-requests", /too many attempts/i],
    ["auth/network-request-failed", /network/i],
    ["auth/invalid-phone-number", /valid 10 digit/i],
    ["auth/not-configured", /not set up/i],
  ])("shows a clear error when sending fails with %s", async (code, message) => {
    sendOtp.mockRejectedValue({ code });
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByLabelText(/^otp$/i)).not.toBeInTheDocument();
  });

  it("allows a resend only after a 30 second cooldown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    await requestOtp(user);

    const resend = screen.getByRole("button", { name: /resend otp/i });
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent(/30s/);

    // The fake clock also runs with real time (shouldAdvanceTime), so leave a
    // few seconds of margin for a busy machine on either side of 30 s.
    act(() => vi.advanceTimersByTime(25000));
    expect(resend).toBeDisabled();

    act(() => vi.advanceTimersByTime(6000));
    expect(resend).toBeEnabled();

    await user.click(resend);
    expect(sendOtp).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /resend otp/i })).toBeDisabled();
  });

  it("lets the user go back and change the number", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await user.click(screen.getByRole("button", { name: /change number/i }));
    expect(phoneInput()).toBeInTheDocument();
    expect(screen.queryByLabelText(/^otp$/i)).not.toBeInTheDocument();
  });
});

describe("demo login", () => {
  it.each([
    [/^citizen/i, "citizen", "/citizen"],
    [/sanitation worker/i, "worker", "/worker"],
    [/government official/i, "official", "/official"],
  ])("still signs in through the %s card", async (card, role, home) => {
    const user = userEvent.setup();
    renderApp();
    const demo = screen.getByRole("region", { name: /demo login/i });
    await user.type(within(demo).getByLabelText(/your name/i), "Asha");
    await user.click(within(demo).getByRole("button", { name: card }));
    expect(path()).toBe(home);
    expect(readSession()).toMatchObject({ role, method: "demo", name: "Asha" });
    expect(sendOtp).not.toHaveBeenCalled();
  });
});

describe("role guard for OTP users", () => {
  it.each(["/worker", "/worker/tasks", "/official", "/official/complaints", "/official/workers"])(
    "sends an OTP citizen away from %s",
    async (target) => {
      startOtpSession({ uid: "fb-uid-1", phone: "9876543210" });
      renderApp(target);
      expect(await screen.findByRole("heading", { name: /citizen!/i })).toBeInTheDocument();
      expect(path()).toBe("/citizen");
    }
  );

  it("treats an OTP session edited to a staff role as signed out", () => {
    startOtpSession({ uid: "fb-uid-1", phone: "9876543210" });
    const key = "ssb_auth_session_v1";
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), role: "official" }));
    renderApp("/official");
    expect(path()).toBe("/login");
  });
});

describe("logout", () => {
  async function logoutFromProfile(user) {
    await user.click(await screen.findByRole("button", { name: /^logout$/i }));
    await user.click(screen.getByRole("button", { name: /^log out$/i }));
  }

  it("signs an OTP user out of Firebase and clears the session", async () => {
    startOtpSession({ uid: "fb-uid-1", phone: "9876543210" });
    const user = userEvent.setup();
    renderApp("/citizen/profile");
    expect(await screen.findByText("+91 98XXXXXX10")).toBeInTheDocument();
    await logoutFromProfile(user);
    expect(signOutUser).toHaveBeenCalledTimes(1);
    expect(readSession()).toBeNull();
    expect(path()).toBe("/login");
  });

  it("clears a demo session without calling Firebase", async () => {
    startSession("citizen", "Asha");
    const user = userEvent.setup();
    renderApp("/citizen/profile");
    await logoutFromProfile(user);
    expect(signOutUser).not.toHaveBeenCalled();
    expect(readSession()).toBeNull();
    expect(path()).toBe("/login");
  });
});
