// Feature 4 on the screens: report a problem with a specific bin or toilet.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));

import App from "../App";
import FacilityPopupContent from "../components/FacilityPopupContent";
import { startOtpSession, startSession } from "../services/authSession";
import { createFacilityComplaint, assignComplaint } from "../services/complaintService";
import { LEGACY_BINS, TOILETS, seedLocalApi } from "../test/fixtures";
import { acceptConsentLocally } from "../test/consent";

const TOILET = { id: "PT-001", type: "toilet", name: "Main Gate Toilet", address: TOILETS[0].address, latitude: TOILETS[0].latitude, longitude: TOILETS[0].longitude };

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

const citizen = (uid = "fac-reporter") => {
  const user = startOtpSession({ uid, phone: "9876543210" });
  acceptConsentLocally(user);
  return user;
};

beforeEach(() => {
  seedLocalApi({ locations: [...LEGACY_BINS, ...TOILETS] });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => vi.unstubAllGlobals());

async function openSheet(path = "/citizen/toilet/PT-001") {
  renderApp(path);
  await userEvent.click(await screen.findByRole("button", { name: "Report an issue" }));
  return screen.findByRole("dialog", { name: "Report an issue" });
}

describe("report sheet", () => {
  it("shows the facility locked at the top, and the toilet's own categories", async () => {
    citizen();
    const sheet = await openSheet();
    const locked = within(sheet).getByRole("group", { name: "Reporting" });
    expect(within(locked).getByText("Main Gate Toilet")).toBeInTheDocument();
    expect(within(locked).getByText(/Public toilet · PT-001/)).toBeInTheDocument();
    expect(within(locked).queryByRole("textbox")).toBeNull(); // nothing to change here
    for (const c of ["Dirty", "No water", "Broken fixtures", "Locked/closed", "No lighting", "Safety concern", "Other"]) {
      expect(within(sheet).getByRole("radio", { name: c })).toBeInTheDocument();
    }
    expect(within(sheet).queryByRole("radio", { name: "Overflowing" })).toBeNull();
  });

  it("a bin's sheet has the bin categories", async () => {
    citizen();
    const sheet = await openSheet("/citizen/bin/DB-001");
    expect(within(within(sheet).getByRole("group", { name: "Reporting" })).getByText(/Dustbin · DB-001/)).toBeInTheDocument();
    for (const c of ["Overflowing", "Damaged", "Not collected", "Bad smell", "Missing", "Other"]) {
      expect(within(sheet).getByRole("radio", { name: c })).toBeInTheDocument();
    }
  });

  it("a citizen reports a toilet and sees it in their complaints", async () => {
    citizen();
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("radio", { name: "No water" }));
    await userEvent.type(within(sheet).getByLabelText(/describe the problem/i), "Taps are dry");
    await userEvent.click(within(sheet).getByRole("button", { name: "Send report" }));

    // the tracking page of the new complaint, linked to the toilet
    expect(await screen.findByText(/Toilet PT-001 · No water/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    const { getComplaints } = await import("../services/complaintService");
    expect(getComplaints().filter((c) => c.facilityId === "PT-001")).toHaveLength(1);
  });

  it("the same report again: 'You already reported this' with a button to the open one, not an error", async () => {
    citizen();
    const first = await createFacilityComplaint({ facility: TOILET, category: "Dirty" });
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("radio", { name: "Dirty" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Send report" }));

    expect(await within(sheet).findByRole("heading", { name: "You already reported this" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("alert")).toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "Open your report" }));
    expect(await screen.findByText(`#${first.id}`, { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it('"Other" needs a description, shown next to the field', async () => {
    citizen();
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("radio", { name: "Other" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Send report" }));
    const box = within(sheet).getByLabelText(/describe the problem/i);
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(within(sheet).getByRole("alert")).toHaveTextContent(/describe/i);
  });

  it("a category is required", async () => {
    citizen();
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("button", { name: "Send report" }));
    expect(within(sheet).getByRole("alert")).toHaveTextContent(/choose what's wrong/i);
  });

  it("Escape or Close shuts the sheet", async () => {
    citizen();
    await openSheet();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Report an issue" }));
    const sheet = await screen.findByRole("dialog", { name: "Report an issue" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens straight away from a map popup link (?report=1)", async () => {
    citizen();
    renderApp("/citizen/toilet/PT-001?report=1");
    expect(await screen.findByRole("dialog", { name: "Report an issue" })).toBeInTheDocument();
  });
});

describe("facility details show the open complaint count", () => {
  it("counts open reports about this toilet", async () => {
    citizen();
    await createFacilityComplaint({ facility: TOILET, category: "Dirty" });
    citizen("someone-else");
    await createFacilityComplaint({ facility: TOILET, category: "No water" });
    renderApp("/citizen/toilet/PT-001");
    expect(await screen.findByText("2 open reports")).toBeInTheDocument();
  });
});

describe("map popups", () => {
  it("bins and toilets have a Report an issue button for citizens", async () => {
    const onReport = vi.fn();
    render(<FacilityPopupContent item={{ ...TOILET, status: "Open" }} kind="toilet" onReport={onReport} />);
    await userEvent.click(screen.getByRole("button", { name: "Report an issue" }));
    expect(onReport).toHaveBeenCalledWith("toilet", expect.objectContaining({ id: "PT-001" }));
  });

  it("no button where nobody can report (workers, officials)", () => {
    render(<FacilityPopupContent item={{ ...TOILET, status: "Open" }} kind="toilet" />);
    expect(screen.queryByRole("button", { name: "Report an issue" })).toBeNull();
  });
});

describe("officials and workers see the linked facility", () => {
  beforeEach(async () => {
    citizen();
    await createFacilityComplaint({ facility: TOILET, category: "No water" });
    const general = await import("../services/complaintService");
    general.createComplaint({
      citizenName: "Demo Citizen",
      issueType: "Dirty Area",
      description: "Litter near the gate",
      location: { address: "Gate 2", latitude: 29.89, longitude: 77.96 },
      priority: "MEDIUM",
    });
  });

  it("the official's list shows the facility and filters by facility type", async () => {
    acceptConsentLocally(startSession("official", ""));
    renderApp("/official/complaints");
    expect(await screen.findByText(/Toilet PT-001 · No water/)).toBeInTheDocument();
    expect(screen.getByText("Gate 2")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Facility"), "toilet");
    expect(screen.getByText(/Toilet PT-001 · No water/)).toBeInTheDocument();
    expect(screen.queryByText("Gate 2")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Facility"), "bin");
    expect(screen.queryByText(/Toilet PT-001/)).toBeNull();
  });

  it("the new report reaches the official's notifications", async () => {
    acceptConsentLocally(startSession("official", ""));
    renderApp("/official/notifications");
    expect(await screen.findByText(/Public Toilet Issue/)).toBeInTheDocument();
  });

  it("the assigned worker's tasks show the facility and filter by facility type", async () => {
    const { getComplaints } = await import("../services/complaintService");
    const toiletReport = getComplaints().find((c) => c.facilityId === "PT-001");
    const general = getComplaints().find((c) => !c.facilityId);
    const worker = startSession("worker", "");
    acceptConsentLocally(worker);
    assignComplaint(toiletReport.id, worker.id, worker.name);
    assignComplaint(general.id, worker.id, worker.name);
    renderApp("/worker/tasks");
    expect(await screen.findByText(/Toilet PT-001 · No water/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Facility"), "none");
    expect(screen.queryByText(/Toilet PT-001/)).toBeNull();
    expect(screen.getByText("Gate 2")).toBeInTheDocument();
  });
});
