import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll } from "../test/consent";
import { demoLogin, openDemoSheet, otpBoxes, otpValue, phoneInput, queryOtpBoxes, requestOtp, sendOtpButton, typeOtp } from "../test/loginPage";

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
  it("is short and neutral: compact header, one heading, phone first", () => {
    renderApp();
    expect(screen.getByRole("heading", { level: 1, name: /smart swachh bharat/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Log in to continue" })).toBeInTheDocument();
    expect(screen.getByText("Report it. Track it. Keep it clean.")).toBeInTheDocument();
    for (const gone of [/welcome back/i, /connecting citizens/i, /cleaner india/i, /choose how you want to log in/i, /\|/]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    expect(screen.getByText("Hackathon prototype — not an official government service")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
    // The phone field is the first field on the page.
    expect(screen.getAllByRole("textbox")[0]).toBe(phoneInput());
  });

  it("puts +91 inside the phone field and asks for the numeric keypad", () => {
    renderApp();
    const field = phoneInput();
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(field).toHaveAttribute("autocomplete", "tel-national");
    expect(field).toHaveAttribute("type", "tel");
    const wrapper = field.closest("[data-field]");
    expect(within(wrapper).getByText("+91")).toBeInTheDocument();
    expect(screen.getByText("Mobile number").tagName).toBe("LABEL"); // a visible label, not a placeholder
  });

  it("shows no demo cards and no name field on the page itself", () => {
    renderApp();
    expect(screen.queryByRole("button", { name: /sanitation worker|government official/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try the demo/i })).toBeInTheDocument();
  });
});

describe("phone step", () => {
  it("keeps Send OTP disabled until 10 valid digits are entered", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(sendOtpButton()).toBeDisabled();
    await user.type(phoneInput(), "98765");
    expect(sendOtpButton()).toBeDisabled();
    await user.type(phoneInput(), "43210");
    expect(sendOtpButton()).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a full number that can't be an Indian mobile, under the field", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.type(phoneInput(), "5876543210");
    expect(sendOtpButton()).toBeDisabled();
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent(/valid 10 digit/i);
    expect(phoneInput()).toHaveAttribute("aria-invalid", "true");
    expect(phoneInput().getAttribute("aria-describedby")).toContain(error.id);
    await user.click(sendOtpButton());
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it("only lets digits into the phone field, up to 10", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.type(phoneInput(), "98a7 6-54321099");
    expect(phoneInput()).toHaveValue("9876543210");
  });

  it.each([
    ["auth/too-many-requests", /too many attempts/i],
    ["auth/network-request-failed", /network/i],
    ["auth/invalid-phone-number", /valid 10 digit/i],
    ["auth/not-configured", /not set up/i],
  ])("shows a clear error when sending fails with %s, and stays on the phone step", async (code, message) => {
    sendOtp.mockRejectedValue({ code });
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(queryOtpBoxes()).toHaveLength(0);
    expect(phoneInput()).toHaveValue("9876543210");
  });
});

describe("OTP step", () => {
  it("replaces the phone step with six one-digit boxes and focuses the first", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    expect(sendOtp).toHaveBeenCalledWith("9876543210");
    const boxes = await screen.findAllByRole("textbox", { name: /^digit \d of 6$/i });
    expect(boxes).toHaveLength(6);
    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument();
    await waitFor(() => expect(boxes[0]).toHaveFocus());
    // The first box takes a whole autofilled code (iOS fills only the first field); the rest hold one digit.
    expect(boxes[0]).toHaveAttribute("autocomplete", "one-time-code");
    expect(boxes[0]).toHaveAttribute("maxlength", "6");
    for (const box of boxes) expect(box).toHaveAttribute("inputmode", "numeric");
    for (const box of boxes.slice(1)) expect(box).toHaveAttribute("maxlength", "1");
    expect(screen.getByRole("group", { name: /enter the 6 digit code/i })).toHaveAccessibleDescription(/\+91 98XXXXXX10/);
  });

  it("moves along as digits are typed and back with Backspace", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await typeOtp(user, "12a3");
    expect(otpValue()).toBe("123");
    expect(otpBoxes()[3]).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(otpBoxes()[2]).toHaveFocus();
    expect(otpValue()).toBe("12");
  });

  it("accepts a pasted code, wherever it is pasted", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await user.click(otpBoxes()[3]);
    await user.paste(" 123-456 ");
    expect(otpValue()).toBe("123456");
    expect(otpBoxes()[5]).toHaveFocus();
    expect(screen.getByRole("button", { name: /verify/i })).toBeEnabled();
  });

  it("accepts the whole code from SMS autofill into the first box", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    // Autofill sets the first box's value in one go, like a change event with 6 characters.
    fireEvent.change(otpBoxes()[0], { target: { value: "654321" } });
    expect(otpValue()).toBe("654321");
  });

  it("keeps Verify disabled until all 6 digits are in", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await typeOtp(user, "123");
    expect(screen.getByRole("button", { name: /verify/i })).toBeDisabled();
    await user.keyboard("456");
    expect(screen.getByRole("button", { name: /verify/i })).toBeEnabled();
  });

  it("signs a verified user in as a citizen and opens the citizen dashboard", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await typeOtp(user, "123456");
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

  it("shows a wrong OTP inline under the boxes, announced, and stays on the login page", async () => {
    confirmOtp.mockRejectedValue({ code: "auth/invalid-verification-code" });
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await typeOtp(user, "000000");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(/incorrect/i);
    const group = screen.getByRole("group", { name: /enter the 6 digit code/i });
    expect(group.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const box of otpBoxes()) expect(box).toHaveAttribute("aria-invalid", "true");
    expect(otpBoxes()[0].getAttribute("aria-describedby")).toContain(error.id);
    expect(path()).toBe("/login");
    expect(readSession()).toBeNull();
  });

  it("after a wrong code: boxes cleared, first focused, red until the user types, nothing selected", async () => {
    confirmOtp.mockRejectedValueOnce({ code: "auth/invalid-verification-code" });
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await typeOtp(user, "000000");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    await screen.findByRole("alert");

    expect(otpValue()).toBe("");
    await waitFor(() => expect(otpBoxes()[0]).toHaveFocus());
    const active = document.activeElement;
    expect(active.selectionEnd - active.selectionStart).toBe(0); // no highlighted digit
    for (const box of otpBoxes()) {
      expect(box).toHaveAttribute("aria-invalid", "true");
      expect(box.className).toMatch(/\bborder-red-400\b/);
    }
    expect(screen.getByRole("button", { name: /verify/i })).toBeDisabled();

    // The first digit typed ends the error state for every box.
    await user.keyboard("1");
    expect(otpValue()).toBe("1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    for (const box of otpBoxes()) {
      expect(box).not.toHaveAttribute("aria-invalid");
      expect(box.className).not.toMatch(/\bborder-red-400\b/);
    }
    expect(otpBoxes()[1]).toHaveFocus();
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
    await typeOtp(user, "123456");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(readSession()).toBeNull();
  });

  it("allows a resend only after a 30 second cooldown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    await requestOtp(user);
    // The countdown's interval starts in a passive effect, which React flushes
    // on a later task. Flush it now, so the interval exists (on the fake clock)
    // before the clock is advanced; otherwise this test depends on timing.
    await act(async () => {});

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

  it("Change number goes back to the phone step with the number kept and focused", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    await user.click(screen.getByRole("button", { name: /change number/i }));
    const field = await screen.findByLabelText(/mobile number/i);
    expect(field).toHaveValue("9876543210");
    await waitFor(() => expect(field).toHaveFocus());
    expect(queryOtpBoxes()).toHaveLength(0);
  });

  it("controls are at least 44px touch targets", async () => {
    const user = userEvent.setup();
    renderApp();
    await requestOtp(user);
    for (const name of [/change number/i, /resend otp/i, /verify/i]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/\bmin-h-11\b|\bh-12\b/);
    }
    for (const box of otpBoxes()) expect(box.className).toMatch(/\bh-12\b/);
  });
});

describe("demo login (browser-only build: always offered)", () => {
  it("opens a sheet of three roles, with no name field", async () => {
    const user = userEvent.setup();
    renderApp();
    const sheet = await openDemoSheet(user);
    expect(sheet).toHaveAttribute("aria-modal", "true");
    for (const role of [/^citizen/i, /sanitation worker/i, /government official/i]) {
      expect(within(sheet).getByRole("button", { name: role })).toBeInTheDocument();
    }
    expect(within(sheet).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it.each([
    [/^citizen/i, "citizen", "/citizen", "Demo Citizen"],
    [/sanitation worker/i, "worker", "/worker", undefined],
    [/government official/i, "official", "/official", "Demo Official"],
  ])("signs in through the %s row", async (row, role, home, name) => {
    const user = userEvent.setup();
    renderApp();
    await demoLogin(user, row);
    expect(path()).toBe(home);
    expect(readSession()).toMatchObject({ role, method: "demo", ...(name ? { name } : {}) });
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it("closes on Escape and gives focus back to the link", async () => {
    const user = userEvent.setup();
    renderApp();
    await openDemoSheet(user);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /try the demo/i })).toHaveFocus());
  });

  it("closes with its Close button", async () => {
    const user = userEvent.setup();
    renderApp();
    const sheet = await openDemoSheet(user);
    await user.click(within(sheet).getByRole("button", { name: /^close$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps keyboard focus inside the sheet", async () => {
    const user = userEvent.setup();
    renderApp();
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
    await user.tab();
    expect(document.activeElement).toBe(focusable[0]);
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
