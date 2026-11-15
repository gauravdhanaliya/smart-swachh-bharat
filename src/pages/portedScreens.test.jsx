// Screen behaviour ported from main's 7cef7da (components.test "empty
// states", freshStart.test "empty states", plus the fixes ported with them),
// rewritten for the seeded demo data: here the stores are emptied on purpose.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll, acceptConsentLocally } from "../test/consent";
import { seedLocalApi } from "../test/fixtures";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));
vi.mock("../components/PickLocationMap", () => ({ default: () => <div data-testid="pick-map" /> }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  Marker: () => null,
  useMap: () => ({ setView: () => {} }),
}));
vi.mock("../services/geocode", () => ({ reverseGeocode: vi.fn(async () => "12 Main Road, Roorkee") }));

import App from "../App";
import { startEmailSession, startSession } from "../services/authSession";
import { addWorker, removeWorker } from "../services/workerService";
import { assignComplaint, createComplaint, getComplaints, updateComplaintStatus } from "../services/complaintService";
import { deleteMyData } from "../services/consentService";
import { rememberGpsAck } from "../utils/gps";
import { DELETED_USER_NAME } from "../../server/src/constants.js";

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

/** No complaints, facilities or requests on this device. */
function emptyData() {
  localStorage.setItem("ssb_complaints_v1", "[]");
  seedLocalApi({ locations: [], requests: [] });
}

// A StatTile's value sits just before its label (a status badge with the same text has no sibling).
// A stat tile's number, found by its exact label inside [data-kpi-card].
const tile = (label) =>
  [...document.querySelectorAll("[data-kpi-card]")].find((card) => [...card.querySelectorAll("span")].some((el) => el.textContent === label && !el.children.length))?.querySelector(".tabular-nums")?.textContent;

const complaint = (overrides = {}) => ({
  citizenName: "Asha",
  issueType: "Overflowing Bin",
  description: "Bin near the gate is overflowing",
  location: { address: "Main Gate", latitude: 29.88, longitude: 77.95 },
  priority: "MEDIUM",
  ...overrides,
});

beforeEach(() => {
  acceptConsentForAll();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("empty states with no data", () => {
  beforeEach(emptyData);

  it("citizen complaints list invites the first report", async () => {
    startSession("citizen", "Asha");
    const user = userEvent.setup();
    renderApp("/citizen/complaints");
    expect(await screen.findByText("No complaints yet. Report your first issue.")).toBeInTheDocument();
    expect(screen.queryByText("No complaints in this category yet.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Report Issue" }));
    await waitFor(() => expect(path()).toBe("/citizen/report"));
  });

  it("citizen home says there are no reports yet and the city has no toilets mapped yet", async () => {
    startSession("citizen", "Asha");
    renderApp("/citizen");
    expect(await screen.findByText(/No public toilets are mapped in .+ yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My reports: no reports yet" })).toBeInTheDocument();
  });

  it("worker dashboard shows 0 and says no tasks are assigned; so does the task list", async () => {
    startSession("worker", "");
    const { unmount } = renderApp("/worker");
    await screen.findByRole("heading", { name: "Dashboard" });
    for (const label of ["Assigned", "New", "In progress", "Completed", "High priority"]) expect(tile(label)).toBe("0");
    expect(screen.getByText("No tasks assigned yet.")).toBeInTheDocument();
    unmount();

    renderApp("/worker/tasks");
    expect(await screen.findByText("No tasks assigned yet.")).toBeInTheDocument();
    expect(screen.queryByText("No tasks in this view. Check back soon.")).toBeNull();
  });

  it("worker facility requests", async () => {
    startSession("worker", "");
    renderApp("/worker/facility-requests");
    expect(await screen.findByText("No facility requests in this category yet.")).toBeInTheDocument();
  });

  it("official complaints and facility requests", async () => {
    startSession("official", "");
    const complaints = renderApp("/official/complaints");
    expect(await screen.findByText("No complaints yet.")).toBeInTheDocument();
    complaints.unmount();

    renderApp("/official/facility-requests");
    expect(await screen.findByText("No facility requests yet.")).toBeInTheDocument();
    expect(screen.queryByText("No requests here")).toBeNull();
  });

  it.each([
    ["/official/bins", "No bins added yet.", "e.g. Library Entrance Bin"],
    ["/official/toilets", "No public toilets added yet.", "e.g. Library Public Toilet"],
  ])("%s says nothing is added yet and offers Add Facility", async (page, message, namePlaceholder) => {
    startSession("official", "");
    const user = userEvent.setup();
    renderApp(page);
    expect(await screen.findByText(message)).toBeInTheDocument();
    const empty = screen.getByText(message).parentElement;
    await user.click(within(empty).getByRole("button", { name: "Add Facility" }));
    await waitFor(() => expect(path()).toBe("/official/add-facility"));
    expect(await screen.findByRole("heading", { name: "Add Facility" })).toBeInTheDocument();
    // The type the empty state came from is already chosen.
    expect(screen.getByLabelText("Name")).toHaveAttribute("placeholder", namePlaceholder);
  });

  it("official buildings page says none are added yet", async () => {
    startSession("official", "");
    renderApp("/official/locations");
    expect(await screen.findByText(/^No buildings added yet\./)).toBeInTheDocument();
  });
});

describe("lists with data keep their filter messages", () => {
  it("bins: a filter with no match says to try another, without the 'none added' card", async () => {
    seedLocalApi({
      locations: [
        { id: "DB-001", name: "Only Bin", type: "dustbin", latitude: 29.89, longitude: 77.96, address: "x", status: "normal", source: "government", createdBy: "Demo Official", createdAt: "2026-06-01T08:00:00.000Z", updatedAt: "2026-06-01T08:00:00.000Z", details: { wasteType: "Dry Waste" } },
      ],
      requests: [],
    });
    startSession("official", "");
    const user = userEvent.setup();
    renderApp("/official/bins");
    await screen.findByText("Only Bin");
    await user.click(screen.getByRole("button", { name: /^Overflow/ }));
    expect(screen.getByText("Try a different filter.")).toBeInTheDocument();
    expect(screen.queryByText("No bins added yet.")).toBeNull();
  });
});

describe("worker dashboard counts", () => {
  it("'Assigned' is every task given to the worker, with in-progress ones counted once", async () => {
    localStorage.setItem("ssb_complaints_v1", "[]");
    const ids = [createComplaint(complaint()), createComplaint(complaint()), createComplaint(complaint({ priority: "HIGH" }))].map((c) => c.id);
    for (const id of ids) assignComplaint(id, "w1", "Vikash Kumar");
    updateComplaintStatus(ids[1], "IN_PROGRESS");
    updateComplaintStatus(ids[2], "RESOLVED");
    startSession("worker", "");
    renderApp("/worker");
    await screen.findByRole("heading", { name: "Dashboard" });
    expect(tile("Assigned")).toBe("3");
    expect(tile("New")).toBe("1");
    expect(tile("In progress")).toBe("1");
    expect(tile("Completed")).toBe("1");
    // All active tasks are listed (the list scrolls on its own), not just the first four.
    expect(screen.queryByText("No tasks assigned yet.")).toBeNull();
  });

  it("lists every active task, not only the first four", async () => {
    localStorage.setItem("ssb_complaints_v1", "[]");
    const ids = Array.from({ length: 6 }, () => createComplaint(complaint()).id);
    for (const id of ids) assignComplaint(id, "w1", "Vikash Kumar");
    startSession("worker", "");
    renderApp("/worker");
    await screen.findByRole("heading", { name: "Dashboard" });
    for (const id of ids) expect(screen.getByText(`#${id}`)).toBeInTheDocument();
  });
});

describe("assigning a complaint uses the live worker directory", () => {
  it("offers a worker the official added, not one they removed, and assigns the new one", async () => {
    const added = addWorker({ name: "Sunita Devi", email: "sunita@example.test", area: "Ward 9" });
    removeWorker("w2");
    const c = createComplaint(complaint());
    startSession("official", "");
    const user = userEvent.setup();
    renderApp(`/official/complaints/${c.id}`);
    await screen.findByText("Assign Worker");
    const select = screen.getAllByRole("combobox").find((el) => within(el).queryByRole("option", { name: /Select a worker/ }));
    const names = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(names).toContain("Sunita Devi — Ward 9");
    expect(names.some((n) => n.startsWith("Vikash Kumar"))).toBe(true);
    expect(names.some((n) => n.startsWith("Ramesh Kumar"))).toBe(false); // w2, removed

    await user.selectOptions(select, added.id);
    await user.click(screen.getByRole("button", { name: "Assign Complaint" }));
    await waitFor(() => expect(getComplaints().find((x) => x.id === c.id)).toMatchObject({ status: "ASSIGNED", assignedWorkerId: added.id, assignedWorkerName: "Sunita Devi" }));
  });
});

describe("delete my data reaches reports filed from the Report Issue screen", () => {
  it("an OTP citizen's report is anonymised when they delete their data", async () => {
    rememberGpsAck();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (ok) => {
          ok({ coords: { latitude: 29.8543, longitude: 77.888, accuracy: 5 } });
          return 1;
        },
        clearWatch: () => {},
        getCurrentPosition: (ok) => ok({ coords: { latitude: 29.8543, longitude: 77.888, accuracy: 5 } }),
      },
    });
    const session = startEmailSession({ uid: "fb-uid-7", email: "citizen@example.test" });
    acceptConsentLocally(session);
    const user = userEvent.setup();
    renderApp("/citizen/report");
    await user.click(await screen.findByRole("button", { name: /Overflowing Bin$/ }));
    await user.click(screen.getAllByRole("button", { name: "Use my current location" }).at(-1));
    await user.type(screen.getByPlaceholderText("Write more about the issue…"), "Bin by the bus stop is overflowing");
    await user.click(screen.getByRole("button", { name: "Submit Report" }));
    await waitFor(() => expect(path()).toMatch(/^\/citizen\/complaints\/SSB/));

    const filed = getComplaints().find((c) => c.description === "Bin by the bus stop is overflowing");
    expect(filed.citizenId).toBe("fb-uid-7");

    const res = await deleteMyData();
    expect(res.anonymised.complaints).toBe(1);
    expect(getComplaints().find((c) => c.id === filed.id)).toMatchObject({ citizenId: null, citizenName: DELETED_USER_NAME });
  });
});

describe("not-found screens", () => {
  it.each([
    ["citizen", "/citizen/bin/DB-999", "Bin not found", /removed by an official, or the app's data was reset/],
    ["citizen", "/citizen/toilet/PT-999", "Toilet not found", /removed by an official, or the app's data was reset/],
    ["citizen", "/citizen/complaints/SSB2026-9999", "Complaint not found", /deleted, or the app's data was reset/],
    ["official", "/official/complaints/SSB2026-9999", "Complaint not found", /deleted, or the app's data was reset/],
    ["worker", "/worker/tasks/SSB2026-9999", "Task not found", /deleted, or the app's data was reset/],
    ["worker", "/worker/facility-requests/FR-2026-999", "Request not found", /deleted, or the app's data was reset/],
  ])("%s %s explains it without blaming the demo data set", async (role, at, title, why) => {
    startSession(role, "");
    renderApp(at);
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/demo data set|OpenStreetMap pins/);
  });
});
