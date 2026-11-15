// Shared helpers for the start screen (src/pages/ChooseRole.jsx) in tests.
// A first visit shows the consent step; then the card is the email login
// itself (Log in, Forgot password?, Create account), with a "Try the demo"
// link below it (a sheet) where the demo login is on.
import { screen, within } from "@testing-library/react";

/** The start screen's card (the email login form). */
export const loginCard = () => screen.findByRole("region", { name: /^(log in|create account|reset your password|check your inbox)$/i });

/** Ticks every box on the consent step and agrees. */
export async function agreeToConsent(user) {
  await screen.findByRole("heading", { name: /before you start/i });
  for (const box of screen.getAllByRole("checkbox")) if (!box.checked) await user.click(box);
  await user.click(screen.getByRole("button", { name: /agree and continue/i }));
}

/** Types an email and password into the start screen's card and presses Log in. */
export async function logInWith(user, email = "asha@example.test", password = "s3cret-pass") {
  const card = await loginCard();
  await user.type(within(card).getByLabelText(/^email$/i), email);
  await user.type(within(card).getByLabelText(/^password$/i), password);
  await user.click(within(card).getByRole("button", { name: /^log in$/i }));
}

/** Opens the "Try the demo" sheet and returns it. */
export async function openDemoSheet(user) {
  await user.click(await screen.findByRole("button", { name: /^try the demo$/i }));
  return screen.findByRole("dialog", { name: /try the demo/i });
}

/** Signs in through the demo sheet as `role` (a name matcher such as /sanitation worker/i). */
export async function demoLogin(user, role) {
  const sheet = await openDemoSheet(user);
  await user.click(within(sheet).getByRole("button", { name: role }));
}
