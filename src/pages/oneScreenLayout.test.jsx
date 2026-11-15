// The one-screen Home and Worker dashboards (ported from main: 7467b70 for
// CitizenHome + StatTile `compact`, 7cef7da for MapPreview `fill`,
// WorkerDashboard and the compact role cards). jsdom has no layout engine,
// so these check the structure that makes the layout work, not pixels.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll } from "../test/consent";

vi.mock("../components/FacilityMap", () => ({ default: ({ className }) => <div data-testid="facility-map" className={className} /> }));

import App from "../App";
import MapPreview from "../components/MapPreview";
import StatTile from "../components/StatTile";
import RoleCard from "../components/RoleCard";
import { startSession } from "../services/authSession";
import { assignComplaint, createComplaint } from "../services/complaintService";

function renderApp(at) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <App />
    </MemoryRouter>
  );
}

/** The shell's content area: the frame's child that holds the page. */
const scrollsOuter = (el) => /\boverflow-y-auto\b/.test(el.className);

beforeEach(() => {
  acceptConsentForAll();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => vi.unstubAllGlobals());

describe("MapPreview", () => {
  it("is 160px tall by default", () => {
    render(
      <MemoryRouter>
        <MapPreview />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: /^Open the full map/ })).toHaveStyle({ height: "160px" });
  });

  it("with `fill`, takes its parent's height (with a floor)", () => {
    render(
      <MemoryRouter>
        <MapPreview fill />
      </MemoryRouter>
    );
    const button = screen.getByRole("button", { name: /^Open the full map/ });
    expect(button.style.height).toBe("100%");
    expect(button.style.minHeight).toBe("96px");
  });
});

describe("StatTile", () => {
  it("compact tightens padding, icon and value size; the default is unchanged", () => {
    const { rerender } = render(<StatTile label="Bins" value={3} icon={<svg />} />);
    expect(screen.getByText("3").className).toContain("text-xl");
    rerender(<StatTile label="Bins" value={3} icon={<svg />} compact />);
    expect(screen.getByText("3").className).toContain("text-base");
    expect(screen.getByText("3").closest("div").className).toContain("!p-2.5");
  });
});

describe("RoleCard", () => {
  it("uses the compact card (smaller padding, icon and description)", () => {
    render(<RoleCard id="citizen" title="Citizen" description="Report issues" onSelect={() => {}} />);
    const card = screen.getByRole("button", { name: /Citizen/ });
    expect(card.className).toContain("py-2.5");
    expect(within(card).getByText("Report issues").className).toContain("text-xs");
  });
});

describe("citizen Home fits one screen", () => {
  it("only its content area can scroll (the tab bar sits outside it); the map preview fills the space left", async () => {
    startSession("citizen", "Asha");
    renderApp("/citizen");
    const heading = await screen.findByRole("heading", { level: 1, name: /^Hello/ });
    const frame = heading.closest(".device-frame");
    // On a phone it fits one screen (npm run test:layout); with the verify banner the content area scrolls, never the page.
    const scrollers = [...frame.querySelectorAll(":scope > div")].filter(scrollsOuter);
    expect(scrollers).toHaveLength(1);
    expect(scrollers[0]).toHaveAttribute("data-shell-content");
    expect(scrollers[0].contains(frame.querySelector("[data-bottom-nav]"))).toBe(false);
    // Places load asynchronously: wait for the preview rather than racing it.
    expect((await screen.findByRole("button", { name: /^Open the full map/ })).style.height).toBe("100%");
    expect(screen.getByRole("button", { name: /^report an issue/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^My reports:/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^public toilets$/i })).toBeInTheDocument();
  });
});

describe("worker Dashboard fits one screen", () => {
  it("has no outer scroll; only the active-task list scrolls", async () => {
    const c = createComplaint({
      citizenName: "Asha",
      issueType: "Overflowing Bin",
      description: "Bin near the gate is overflowing",
      location: { address: "Main Gate", latitude: 29.88, longitude: 77.95 },
      priority: "MEDIUM",
    });
    assignComplaint(c.id, "w1", "Vikash Kumar");
    startSession("worker", "");
    renderApp("/worker");
    const heading = await screen.findByRole("heading", { name: "Dashboard" });
    const frame = heading.closest(".device-frame");
    expect([...frame.querySelectorAll(":scope > div")].some(scrollsOuter)).toBe(false);
    const taskCard = screen.getByText(`#${c.id}`).closest("button");
    expect(scrollsOuter(taskCard.parentElement)).toBe(true);
  });
});

describe("Home's 'See full map' link", () => {
  it("is a 44px tap target whose extra height overlaps neighbours instead of growing the layout", async () => {
    startSession("citizen", "Asha");
    renderApp("/citizen");
    const link = await screen.findByRole("button", { name: /^See full map/ });
    const cls = link.className.split(/\s+/);
    expect(cls).toContain("min-h-11"); // 44px
    expect(cls).not.toContain("py-1"); // the old ~24px button
    // 44 - 10 (above) - 10 (below) = 24: the height of its line of text.
    expect(cls).toEqual(expect.arrayContaining(["-my-2.5", "relative", "z-10"]));
    // What it overlaps below is the map preview, which opens the same page.
    const preview = screen.getByRole("button", { name: /^Open the full map/ });
    expect(link.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
