// The citizen Home shows only what a citizen uses: report an issue, their own
// reports, the map and the city's public toilets. The city-wide tiles stay on
// the Government and Worker dashboards.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => null }));

import App from "../App";
import { startEmailSession, startSession, updateSession } from "../services/authSession";
import { createComplaint, updateComplaintStatus } from "../services/complaintService";
import { acceptConsentForAll } from "../test/consent";
import { LEGACY_BINS, TOILETS, seedLocalApi } from "../test/fixtures";
import { refreshFresh } from "../services/locationStore";

// The shared location store keeps what it last loaded; after seeding, load it again.
async function seedPlaces(locations) {
  seedLocalApi({ locations });
  await refreshFresh();
}

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}
const renderHome = () =>
  render(
    <MemoryRouter initialEntries={["/citizen"]}>
      <App />
      <Path />
    </MemoryRouter>
  );

const LOCATION = { address: "Main Gate", latitude: 29.8884, longitude: 77.9589 };
const report = (citizenId, description) => createComplaint({ citizenId, citizenName: "c", issueType: "Overflowing Bin", description, location: LOCATION });
const newAccount = () => startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: true });
const heading = () => screen.findByRole("heading", { level: 1 });

beforeEach(async () => {
  await seedPlaces([...LEGACY_BINS, ...TOILETS]);
  acceptConsentForAll("me-1");
});
afterEach(() => vi.unstubAllGlobals());

describe("header and greeting", () => {
  it("says 'Hello', or 'Hello, <name>' with a profile name; no clock, never 'Good night'", async () => {
    newAccount();
    const first = renderHome();
    expect((await heading()).textContent).toBe("Hello");
    expect(document.body.textContent).not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
    expect(document.body.textContent).not.toMatch(/good night|citizen!/i);
    first.unmount();
    updateSession({ name: "Asha" });
    renderHome();
    expect((await heading()).textContent).toBe("Hello, Asha");
  });

  it("a demo account's default name isn't used", async () => {
    startSession("citizen", "");
    renderHome();
    expect((await heading()).textContent).toBe("Hello");
  });

  it("shows the logo and name, the city selector and the bell; one h1 only", async () => {
    newAccount();
    renderHome();
    await heading();
    expect(screen.getByText("Smart Swachh Bharat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Location: / })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Notifications/ })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("three quick actions, Report, My reports and Map, and no big green Report card", async () => {
    newAccount();
    renderHome();
    await heading();
    expect([...document.querySelectorAll("[data-quick-action]")].map((b) => b.dataset.quickAction)).toEqual(["report", "mine", "map"]);
    expect(screen.queryByText(/bins, toilets or litter/i)).toBeNull();
  });
});

describe("notification badge", () => {
  it("a new account shows no badge, whatever other people's complaints are on the device", async () => {
    for (const who of ["someone-else", "another", null]) report(who, `Someone else's report ${who}`);
    newAccount();
    renderHome();
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(document.querySelector("[data-unread-badge]")).toBeNull();
  });

  it("counts only this account's own unread notifications", async () => {
    report("someone-else", "Not mine at all");
    report("me-1", "Mine, just reported");
    newAccount();
    renderHome();
    expect(await screen.findByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
  });
});

describe("My reports", () => {
  it("with none: 'No reports yet', not '0 open 0 resolved'", async () => {
    newAccount();
    renderHome();
    const card = await screen.findByRole("button", { name: "My reports: no reports yet" });
    expect(card).toHaveTextContent(/none yet/i);
    expect(card.textContent).not.toMatch(/0 open|0 resolved/);
  });

  it("counts only this citizen's own reports, and never colours a number red", async () => {
    const mine = [report("me-1", "My first report here"), report("me-1", "My second report here")];
    report("someone-else", "Somebody else's report");
    updateComplaintStatus(mine[1].id, "RESOLVED");
    newAccount();
    renderHome();
    const card = await screen.findByRole("button", { name: "My reports: 1 open, 1 resolved" });
    expect(card.querySelector("[class*='text-red']")).toBeNull();
  });

  it("Report an issue and My reports open their screens", async () => {
    newAccount();
    const user = userEvent.setup();
    const { unmount } = renderHome();
    await user.click(await screen.findByRole("button", { name: /^report an issue/i }));
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/citizen/report"));
    unmount();
    renderHome();
    await user.click(await screen.findByRole("button", { name: /^My reports:/ }));
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/citizen/complaints"));
  });
});

describe("map and toilets", () => {
  it("has none of the city-wide tiles, and names the sections after the city", async () => {
    newAccount();
    renderHome();
    await heading();
    for (const label of ["Bins Need Collection", "Overflowing Bins", "Complaints Resolved", "Total Complaints", "Total Bins Nearby", "Nearby bins", "Nearby toilets"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByRole("heading", { name: /^Bins and toilets in / })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Public toilets$/ })).toBeInTheDocument();
  });

  it("one way into the map from the card itself (plus 'See full map'): no 'Open Map' pill", async () => {
    newAccount();
    renderHome();
    await heading();
    expect(screen.queryByText(/open map/i)).toBeNull();
    expect(screen.getByRole("button", { name: /^open the full map/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /see full map/i })).toBeInTheDocument();
  });

  it("lists toilets with an address, a rating ('Not rated' or '4.2' with a star) and a status dot with its word; no distance until located", async () => {
    newAccount();
    renderHome();
    const section = await screen.findByRole("region", { name: /^public toilets$/i });
    const rows = within(section).getAllByRole("button").filter((b) => !/use my location/i.test(b.textContent));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(2);
    for (const row of rows) {
      expect(row.textContent).not.toMatch(/DEMO/);
      expect(row.querySelector("[data-rating]").textContent).toMatch(/^(Not rated|\d\.\d)$/);
      expect(row.textContent).toMatch(/open|closed|maintenance/i);
      expect(row.querySelector("[data-distance]")).toBeNull();
    }
  });

  it("demo data: one small DEMO banner at the top, and no 'DEMO' on any item", async () => {
    await seedPlaces([...LEGACY_BINS, { ...TOILETS[0], id: "PT-DEMO-1", name: "Canteen Toilet (DEMO)", isDemo: true }]);
    newAccount();
    renderHome();
    const section = await screen.findByRole("region", { name: /^public toilets$/i });
    const row = within(section).getByRole("button", { name: /canteen toilet/i });
    expect(row.textContent).not.toMatch(/DEMO/i);
    expect(within(row).getByText("Canteen Toilet")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-demo-banner]")).toHaveLength(1);
  });

  it("no DEMO banner when nothing shown is demo data", async () => {
    await seedPlaces([{ ...TOILETS[0], id: "PT-REAL-1", name: "Ward 9 Toilet", isDemo: false }]);
    newAccount();
    renderHome();
    await screen.findByRole("region", { name: /^public toilets$/i });
    expect(document.querySelector("[data-demo-banner]")).toBeNull();
  });

  it("'Use my location' sorts by real distance and only then says 'near you' and shows distances", async () => {
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: LOCATION.latitude, longitude: LOCATION.longitude, accuracy: 10 } }));
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    newAccount();
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole("button", { name: /use my location/i }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1); // only on the tap
    const section = await screen.findByRole("region", { name: /public toilets near you/i });
    const distances = [...section.querySelectorAll("[data-distance]")].map((d) => d.textContent);
    expect(distances.length).toBeGreaterThan(0);
    const metres = distances.map((d) => (d.endsWith("km") ? parseFloat(d) * 1000 : parseFloat(d)));
    expect([...metres].sort((a, b) => a - b)).toEqual(metres); // nearest first
    expect(within(section).getAllByRole("button")[0]).toHaveTextContent(/main gate/i);
  });

  it("if location is blocked, says so plainly and keeps the list", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } });
    newAccount();
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole("button", { name: /use my location/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/location is blocked for this site/i);
    expect(screen.getByRole("region", { name: /^public toilets$/i })).toBeInTheDocument();
  });
});

describe("tab bar", () => {
  it("five equal tabs, Report the same shape as the others; nothing raised above the bar", async () => {
    newAccount();
    renderHome();
    const nav = await screen.findByRole("navigation", { name: "Main" });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Home", "Map", "Report", "Reports", "Profile"]);
    expect(new Set(buttons.map((b) => b.className.replace(/text-brand|text-muted|hover:text-ink/g, "").trim())).size).toBe(1); // one shape
    expect(within(nav).getByRole("button", { name: "Home" }).className).toContain("text-brand");
    expect(within(nav).getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: /quick actions/i })).toBeNull();
    expect(nav.innerHTML).not.toMatch(/-mt-\d/); // no overhanging button
  });

  it("Report opens the report form", async () => {
    newAccount();
    const user = userEvent.setup();
    renderHome();
    await user.click(within(await screen.findByRole("navigation", { name: "Main" })).getByRole("button", { name: "Report" }));
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/citizen/report"));
  });
});

// Reduced motion on the Home is checked in a real browser: npm run test:layout.
