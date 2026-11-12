import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll } from "../test/consent";

// Leaflet needs a real layout engine; the map canvas is not under test. The
// stub lists what it was asked to draw so pins can still be checked and tapped.
vi.mock("../components/FacilityMap", () => ({
  default: ({ bins = [], onSelectBin }) => (
    <ul data-testid="facility-map">
      {bins.map((b) => (
        <li key={b.id}>
          <button type="button" onClick={() => onSelectBin?.(b)}>
            pin {b.id} {b.status}
          </button>
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("../components/PickLocationMap", () => ({ default: () => <div data-testid="pick-map" /> }));

import App from "../App";
import { startSession } from "../services/authSession";
import { api } from "../services/api";
import { seedLocalApi } from "../test/fixtures";

function renderApp(path, role) {
  startSession(role, "");
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

/** No fill percentage, no "fill level" wording, and no bar sized by a percentage. */
function expectNoFillUi() {
  const text = document.body.textContent;
  expect(text).not.toMatch(/\d\s*%/);
  expect(text).not.toMatch(/fill level|% full|waste level/i);
  expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
  expect(screen.queryAllByRole("meter")).toHaveLength(0);
  const percentBars = [...document.body.querySelectorAll("[style]")].filter((el) => /%/.test(el.style.width));
  expect(percentBars).toHaveLength(0);
}

beforeEach(() => {
  seedLocalApi();
  acceptConsentForAll(); // the consent screen has its own tests (consent.test.jsx)
  // No network in tests: OpenStreetMap lookups simply find nothing.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("citizen screens", () => {
  it("home shows bin counts by status and no fill percentage", async () => {
    renderApp("/citizen", "citizen");
    expect(await screen.findByText(/pin DB-002 overflow/)).toBeInTheDocument();
    expectNoFillUi();
  });

  it("map lists bins with their status and no fill percentage", async () => {
    renderApp("/citizen/map", "citizen");
    expect(await screen.findByText("Canteen Bin")).toBeInTheDocument();
    expect(screen.getByText("Library Bin")).toBeInTheDocument();
    expectNoFillUi();
  });

  it("map details card for a tapped bin shows its status and no fill percentage", async () => {
    const user = userEvent.setup();
    renderApp("/citizen/map", "citizen");
    await user.click(await screen.findByRole("button", { name: /pin DB-002/ }));
    expect(await screen.findByText("Waste Type")).toBeInTheDocument();
    expect(screen.getAllByText("Overflow").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/canteen bin/i).length).toBeGreaterThan(0);
    expectNoFillUi();
  });

  it("bin details shows the status badge, with no percentage, bar or history chart", async () => {
    renderApp("/citizen/bin/DB-002", "citizen");
    expect(await screen.findByRole("heading", { name: /wet waste bin/i })).toBeInTheDocument();
    expect(screen.getByText("Overflow")).toBeInTheDocument();
    expect(screen.getByText(/needs collection now/i)).toBeInTheDocument();
    expect(document.querySelector("svg polyline, svg path[d^='M0']")).toBeNull();
    expectNoFillUi();
  });

  it("bin details renders an old record that had only a percentage", async () => {
    renderApp("/citizen/bin/DB-003", "citizen");
    expect(await screen.findByText("Almost Full")).toBeInTheDocument();
    expectNoFillUi();
  });

  it("help page no longer explains fill percentages", async () => {
    renderApp("/citizen/help", "citizen");
    expect(await screen.findByText(/what do the bin statuses mean/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/fill level/i);
    expect(document.body.textContent).not.toMatch(/\d\s*%/);
  });
});

describe("government screens", () => {
  it("dashboard shows a bin status overview with counts, not percentages", async () => {
    renderApp("/official", "official");
    const heading = await screen.findByRole("heading", { name: /bin status overview/i });
    const card = heading.closest("div");
    await waitFor(() => expect(within(card).getByText(/3 total bins/i)).toBeInTheDocument());
    expect(within(card).getByText("Normal").parentElement.parentElement).toHaveTextContent(/1 bin\b/);
    expect(within(card).getByText("Almost Full").parentElement.parentElement).toHaveTextContent(/1 bin\b/);
    expect(within(card).getByText("Overflow").parentElement.parentElement).toHaveTextContent(/1 bin\b/);
    expect(screen.queryByText(/fill level/i)).not.toBeInTheDocument();
    expect(card.textContent).not.toMatch(/%/);
    expect([...card.querySelectorAll("[style]")].filter((el) => /%/.test(el.style.width))).toHaveLength(0);
  });

  it("bins page lists every bin by status and no fill percentage", async () => {
    renderApp("/official/bins", "official");
    expect(await screen.findByText("Canteen Bin")).toBeInTheDocument();
    expect(screen.getByText(/3 bins tracked/i)).toHaveTextContent(/1 overflowing/i);
    expectNoFillUi();
  });

  it("add facility asks for a bin status instead of a fill percentage", async () => {
    const user = userEvent.setup();
    renderApp("/official/add-facility", "official");
    const status = await screen.findByLabelText(/^status$/i);
    expect(within(status).getAllByRole("option").map((o) => o.textContent)).toEqual(["Normal", "Almost Full", "Overflow"]);
    expect(screen.queryByLabelText(/fill/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /fill/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^name$/i), "Gate Bin");
    await user.type(screen.getByLabelText(/^address$/i), "Main Gate");
    await user.type(screen.getByLabelText(/^latitude$/i), "29.8884");
    await user.type(screen.getByLabelText(/^longitude$/i), "77.9589");
    await user.selectOptions(status, "overflow");
    await user.click(screen.getByRole("button", { name: /save facility/i }));

    await waitFor(async () => {
      const { locations } = await api("/locations");
      const created = locations.find((l) => l.name === "Gate Bin");
      expect(created).toMatchObject({ type: "dustbin", status: "overflow" });
      expect(created.details).not.toHaveProperty("fillLevel");
    });
  });

  it("editing a bin offers its current status", async () => {
    renderApp("/official/add-facility?edit=DB-003", "official");
    await waitFor(() => expect(screen.getByLabelText(/^status$/i)).toHaveValue("almost_full"));
    expectNoFillUi();
  });
});

describe("worker screens", () => {
  it("dashboard has no fill percentage", async () => {
    renderApp("/worker", "worker");
    expect(await screen.findAllByText(/dashboard/i)).not.toHaveLength(0);
    expectNoFillUi();
  });

  it("task map has no fill percentage", async () => {
    renderApp("/worker/map", "worker");
    expect(await screen.findByRole("heading", { name: /active task locations/i })).toBeInTheDocument();
    expectNoFillUi();
  });
});

describe("simulated live data", () => {
  it("changes a bin's status over time and never brings a percentage back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    renderApp("/official/bins", "official");
    expect(await screen.findByText("Library Bin")).toBeInTheDocument();
    expect(screen.getByText(/3 bins tracked/i)).toHaveTextContent(/1 overflowing/i);

    // One simulation tick: normal -> almost full, almost full -> overflow, overflow -> normal.
    // Let pending store loads (and the 8 s safety poll) settle as the clock runs, so the
    // 20 s simulation tick is the last change, whatever the machine's load.
    await act(() => vi.advanceTimersByTimeAsync(20000));
    const card = screen.getByText("Hostel Bin").closest("div.rounded-2xl");
    expect(within(card).getByText("Overflow")).toBeInTheDocument();
    expectNoFillUi();
    random.mockRestore();
  });
});
