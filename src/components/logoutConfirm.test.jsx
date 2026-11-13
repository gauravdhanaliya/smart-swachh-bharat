// Logging out from a shell header asks first (ported from main's 7cef7da:
// ConfirmDialog in GovShell, WorkerShell and RoleShell).
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll } from "../test/consent";

vi.mock("./FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));

import App from "../App";
import RoleShell from "./RoleShell";
import ConfirmDialog from "./ConfirmDialog";
import { AuthProvider } from "../context/AuthContext";
import { readSession, startSession } from "../services/authSession";
import { createComplaint } from "../services/complaintService";

function Probe() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}
const path = () => screen.getByTestId("path").textContent;

function renderApp(at) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <App />
      <Probe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  acceptConsentForAll();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const headerLogout = () => screen.getByRole("button", { name: "Logout" });

describe.each([
  ["Government Official", "official", "/official", /choosing Government Official/],
  ["Sanitation Worker", "worker", "/worker", /choosing Sanitation Worker/],
])("%s shell", (_title, role, home, hint) => {
  beforeEach(() => {
    startSession(role, "Asha");
  });

  it("the header Logout asks first; Cancel keeps the session", async () => {
    const user = userEvent.setup();
    renderApp(home);
    await user.click(await screen.findByRole("button", { name: "Logout" }));
    const dialog = screen.getByRole("dialog", { name: "Log out of EcoSetu?" });
    expect(within(dialog).getByText(hint)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(readSession()).toMatchObject({ role });
    expect(path()).toBe(home);
  });

  it("Escape and a tap outside also cancel", async () => {
    const user = userEvent.setup();
    renderApp(home);
    await user.click(await screen.findByRole("button", { name: "Logout" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(headerLogout());
    const backdrop = screen.getByRole("dialog").previousElementSibling;
    await user.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(readSession()).toMatchObject({ role });
  });

  it("confirming signs out and opens the login page", async () => {
    const user = userEvent.setup();
    renderApp(home);
    await user.click(await screen.findByRole("button", { name: "Logout" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Log out" }));
    expect(readSession()).toBeNull();
    expect(path()).toBe("/login");
  });
});

describe("RoleShell", () => {
  it("asks before logging out, then signs out", async () => {
    startSession("official", "Meera");
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/x"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>login page</p>} />
            <Route
              path="/x"
              element={
                <RoleShell role="official" title="Somewhere">
                  <p>content</p>
                </RoleShell>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await user.click(headerLogout());
    expect(screen.getByRole("dialog", { name: "Log out of EcoSetu?" })).toHaveTextContent(/choosing your role/);
    expect(readSession()).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(readSession()).toBeNull();
    expect(screen.getByText("login page")).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("renders nothing while closed", () => {
    render(<ConfirmDialog open={false} title="T" confirmLabel="OK" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is described by its message", () => {
    render(<ConfirmDialog open title="Sure?" message="This can't be undone." confirmLabel="OK" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Sure?" })).toHaveAccessibleDescription("This can't be undone.");
  });

  it("keeps focus where the user put it when the page re-renders behind it", async () => {
    // The shells re-render whenever their data changes (complaints, polling);
    // that must not yank focus back to Cancel while the user is on Log out.
    startSession("official", "Meera");
    const user = userEvent.setup();
    renderApp("/official");
    await user.click(await screen.findByRole("button", { name: "Logout" }));
    const confirm = screen.getByRole("button", { name: "Log out" });
    await user.tab();
    expect(confirm).toHaveFocus();

    await act(async () => {
      createComplaint({
        citizenName: "Asha",
        issueType: "Overflowing Bin",
        description: "Bin near the gate is overflowing",
        location: { address: "Main Gate", latitude: 29.88, longitude: 77.95 },
        priority: "HIGH",
      });
    });
    expect(confirm).toHaveFocus();
  });
});

describe.each([
  ["Government Official", "official", "/official/profile", /choosing Government Official/],
  ["Sanitation Worker", "worker", "/worker/profile", /choosing Sanitation Worker/],
])("%s profile page", (_title, role, page, hint) => {
  // The page's own Logout button (the header icon has an aria-label instead of text).
  const pageLogout = async () =>
    (await screen.findAllByRole("button", { name: /^logout$/i })).find((b) => !b.hasAttribute("aria-label"));

  it("its Logout button asks first too; Cancel keeps the session, Log out signs out", async () => {
    startSession(role, "Asha");
    const user = userEvent.setup();
    renderApp(page);
    await user.click(await pageLogout());
    const dialog = screen.getByRole("dialog", { name: "Log out of EcoSetu?" });
    expect(dialog).toHaveTextContent(hint);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(readSession()).toMatchObject({ role });

    await user.click(await pageLogout());
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Log out" }));
    expect(readSession()).toBeNull();
    expect(path()).toBe("/login");
  });
});
