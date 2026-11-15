// Route-level code splitting: the login screen and the citizen Home ship in
// the main bundle; other pages download on their first visit, with a
// "Loading…" status (not a blank screen) meanwhile.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll } from "./test/consent";

// Hoisted with the vi.mock calls, so it exists even if a page is imported eagerly.
const { loaded } = vi.hoisted(() => ({ loaded: new Set() }));
// vi.mock factories run when a module is first imported: that is the "download".
vi.mock("./pages/government/GovDashboard", async (orig) => {
  loaded.add("GovDashboard");
  return orig();
});
vi.mock("./pages/worker/WorkerDashboard", async (orig) => {
  loaded.add("WorkerDashboard");
  return orig();
});
vi.mock("./pages/MapScreen", async (orig) => {
  loaded.add("MapScreen");
  return orig();
});
// A page whose code never arrives, to see what shows meanwhile.
vi.mock("./pages/CitizenHelp", () => new Promise(() => {}));
vi.mock("./components/FacilityMap", () => ({ default: () => null }));

import App from "./App";
import { startSession } from "./services/authSession";

const show = (at) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <App />
    </MemoryRouter>
  );

beforeEach(() => {
  acceptConsentForAll();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => vi.unstubAllGlobals());

describe("code splitting", () => {
  it("the start screen and the citizen Home don't load the other pages' code", async () => {
    show("/login");
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument(); // rendered at once
    startSession("citizen", "Asha");
    show("/citizen");
    expect(await screen.findByRole("heading", { level: 1, name: /^Hello/ })).toBeInTheDocument();
    expect([...loaded]).toEqual([]);
  });

  it("a page's code loads on its first visit", async () => {
    startSession("official", "");
    show("/official");
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
    expect(loaded.has("GovDashboard")).toBe(true);
    expect(loaded.has("WorkerDashboard")).toBe(false);
  });

  it("while a page's code is downloading, a Loading… status shows instead of a blank screen", async () => {
    startSession("citizen", "Asha");
    show("/citizen/help");
    const status = await screen.findByText("Loading…");
    expect(status.closest("[role=status]")).not.toBeNull();
  });
});
