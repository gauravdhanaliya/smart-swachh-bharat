// The Help page describes the real setup: email accounts, EcoSetu's server
// database and private photo storage (not "this device"); no emoji; no FAQ
// about phone or anonymous sign-in.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => null }));

import CitizenHelp from "./CitizenHelp";
import { AuthProvider } from "../context/AuthContext";
import { startEmailSession } from "../services/authSession";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function renderHelp() {
  return render(
    <MemoryRouter initialEntries={["/citizen/help"]}>
      <AuthProvider>
        <CitizenHelp />
      </AuthProvider>
    </MemoryRouter>
  );
}

const storageRow = (label) => within(screen.getByText(label).closest("div")).getByRole("definition");

beforeEach(() => startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: true }));
afterEach(() => vi.unstubAllEnvs());

describe("Help: About and data storage", () => {
  it("the deployed app (API) keeps data in the server database and photos in private storage", () => {
    vi.stubEnv("VITE_USE_API", "true");
    renderHelp();
    expect(storageRow("Data storage")).toHaveTextContent("Server database (MongoDB Atlas)");
    expect(storageRow("Photos")).toHaveTextContent("Private storage (Vercel Blob)");
    expect(document.body.textContent).not.toMatch(/on this device|lives on this device/i);
  });

  it("the About text describes email sign-in, the server database and private photo storage", () => {
    renderHelp();
    const about = document.querySelector("[data-about-setup]");
    expect(about).toHaveTextContent(/email account/i);
    expect(about).toHaveTextContent(/server database \(MongoDB Atlas\)/i);
    expect(about).toHaveTextContent(/private storage \(Vercel Blob\), never at a public link/i);
    expect(about.textContent).not.toMatch(/this device/i);
  });

  it("the offline development build says plainly that its data stays in the browser", () => {
    vi.stubEnv("VITE_USE_API", "false");
    renderHelp();
    expect(storageRow("Data storage")).toHaveTextContent(/this browser \(offline demo build\)/i);
  });
});

describe("Help: no emoji, no old sign-in", () => {
  it("uses icons, never emoji", () => {
    renderHelp();
    expect(document.body.textContent).not.toMatch(EMOJI);
    expect(document.querySelectorAll("svg").length).toBeGreaterThan(5);
  });

  it("no FAQ mentions phone or anonymous sign-in, or the old green + button", async () => {
    const user = userEvent.setup();
    renderHelp();
    // One answer is open at a time: open each and collect them all.
    let text = document.body.textContent;
    for (const q of screen.getAllByRole("button", { expanded: false })) {
      await user.click(q);
      text += document.body.textContent;
    }
    expect(text).not.toMatch(/anonymous|continue without account|save my account|phone number to sign|otp/i);
    expect(text).not.toMatch(/green \+ button/i);
    expect(text).toMatch(/with an email and a password/i);
  });

  it("lists no unconfirmed national helpline (1969 could not be verified officially)", () => {
    renderHelp();
    expect(document.body.textContent).not.toMatch(/1969/);
    expect(document.querySelector('a[href="tel:1969"]')).toBeNull();
    expect(screen.getByText(/placeholders for this prototype/i)).toBeInTheDocument();
  });

  it("cards use the Home style: a 1px border and no shadow", () => {
    const { container } = renderHelp();
    expect(container.querySelector('[class*="shadow"]')).toBeNull();
    expect(container.querySelector('[class*="border-dashed"]')).toBeNull();
  });
});
