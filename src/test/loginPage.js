// Shared helpers for driving the login page (src/pages/ChooseRole.jsx) in tests.
import { screen, within } from "@testing-library/react";

export const phoneInput = () => screen.getByLabelText(/mobile number/i);
export const sendOtpButton = () => screen.getByRole("button", { name: /send otp/i });

/** The six one-digit OTP boxes, in order. */
export const otpBoxes = () => screen.getAllByRole("textbox", { name: /^digit \d of 6$/i });
export const queryOtpBoxes = () => screen.queryAllByRole("textbox", { name: /^digit \d of 6$/i });

export async function requestOtp(user, number = "9876543210") {
  await user.type(await screen.findByLabelText(/mobile number/i), number);
  await user.click(sendOtpButton());
}

/** Types `code` starting in the first box (focus moves along by itself). */
export async function typeOtp(user, code) {
  await user.click((await screen.findAllByRole("textbox", { name: /^digit \d of 6$/i }))[0]);
  await user.keyboard(code);
}

export const otpValue = () => otpBoxes().map((b) => b.value).join("");

/** Opens the "Try the demo" sheet and returns it. */
export async function openDemoSheet(user) {
  await user.click(await screen.findByRole("button", { name: /try the demo/i }));
  return screen.findByRole("dialog", { name: /try the demo/i });
}

/** Signs in through the demo sheet as `role` (a name matcher such as /^citizen/i). */
export async function demoLogin(user, role) {
  const sheet = await openDemoSheet(user);
  await user.click(within(sheet).getByRole("button", { name: role }));
}
