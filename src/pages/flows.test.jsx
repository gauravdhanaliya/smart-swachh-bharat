// End-to-end journeys through the real screens in the browser-only build
// (ported from main's 7cef7da flows.test, rewritten for demo login, the
// seeded demo data and status-only bins: counts are compared before/after
// instead of starting at 0, and the official assigns the demo worker).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll, agreeOnThisDevice } from "../test/consent";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));
vi.mock("../components/PickLocationMap", () => ({ default: () => <div data-testid="pick-map" /> }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  Marker: () => null,
  useMap: () => ({ setView: () => {} }),
}));
vi.mock("../services/geocode", () => ({ reverseGeocode: vi.fn(async () => "Civil Lines, Roorkee") }));
// The citizen's Firebase account: the same email account every time they log in.
vi.mock("../services/authService", () => ({
  logIn: vi.fn(async () => ({ uid: "flow-citizen", idToken: "t", email: "flow@example.test", emailVerified: true })),
  signOutUser: vi.fn(async () => {}),
}));

import App from "../App";
import { clearSession, startSession } from "../services/authSession";
import { getComplaints } from "../services/complaintService";
import { getFacilityRequests } from "../services/facilityRequestService";
import { getAllBins } from "../services/facilityService";
import { refreshFresh } from "../services/locationStore";
import { rememberGpsAck } from "../utils/gps";
import { demoLogin, logInWith } from "../test/loginPage";

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

// GPS that answers at once with a sharp fix in Roorkee.
function fakeGps() {
  rememberGpsAck();
  const fix = { coords: { latitude: 29.8543, longitude: 77.888, accuracy: 5 } };
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: (ok) => {
        ok(fix);
        return 1;
      },
      clearWatch: () => {},
      getCurrentPosition: (ok) => ok(fix),
    },
  });
}

/**
 * Signs in the way each person really does: a citizen logs in with email,
 * staff use the "Try the demo" sheet.
 */
async function loginAs(row) {
  clearSession();
  agreeOnThisDevice(); // the previous person logged out, which forgets the agreement: this one agrees
  const user = userEvent.setup();
  if (row === CITIZEN) {
    const app = renderApp("/");
    await logInWith(user, "flow@example.test");
    return { ...app, user };
  }
  const app = renderApp("/login");
  await demoLogin(user, row);
  return { ...app, user };
}
const CITIZEN = "citizen";

const onPage = (name) => screen.findByRole("heading", { name });
// The citizen's own open reports, on the Home's "My reports" card ("No reports yet" is none).
const myOpenReports = async () => {
  const name = (await screen.findByRole("button", { name: /^My reports:/ })).getAttribute("aria-label");
  return Number(/(\d+) open/.exec(name)?.[1] ?? 0);
};
const GREETING = /^Hello/;

async function citizenReports(description) {
  fakeGps();
  const { user, unmount } = await loginAs(CITIZEN);
  await waitFor(() => expect(path()).toBe("/citizen"));
  await onPage(GREETING);
  const totalBefore = await myOpenReports();

  await user.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Report" }));
  await waitFor(() => expect(path()).toBe("/citizen/report"));
  await onPage("Report an Issue");
  await user.click(screen.getByRole("button", { name: /Overflowing Bin$/ }));
  await user.click(screen.getAllByRole("button", { name: "Use my current location" }).at(-1));
  await user.type(screen.getByPlaceholderText("Write more about the issue…"), description);
  await user.click(screen.getByRole("button", { name: "Submit Report" }));

  await waitFor(() => expect(path()).toMatch(/^\/citizen\/complaints\/SSB/));
  await onPage("Complaint Tracking");
  const created = getComplaints().find((c) => c.description === description);
  expect(created).toMatchObject({ citizenName: "citizen", citizenId: "flow-citizen", issueType: "Overflowing Bin", status: "SUBMITTED" });
  return { user, unmount, created, totalBefore };
}

beforeEach(() => {
  acceptConsentForAll("flow-citizen");
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("citizen flow", () => {
  it("a report shows in My Complaints and the Home's open count of my reports goes up by one", async () => {
    const description = "Bin at the gate is overflowing badly";
    const { user, created, totalBefore } = await citizenReports(description);

    await user.click(within(screen.getByRole("navigation")).getByRole("button", { name: /^Reports$/ }));
    await waitFor(() => expect(path()).toBe("/citizen/complaints"));
    await onPage("My Complaints");
    expect(screen.getByText(created.id, { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Home/ }));
    await onPage(GREETING);
    await waitFor(async () => expect(await myOpenReports()).toBe(totalBefore + 1));
  });
});

describe("the whole flow across roles", () => {
  it("citizen reports → official assigns → worker starts it and raises a request → official approves and adds a bin → everyone sees it", async () => {
    const citizen = await citizenReports("Garbage dumped next to the canteen");
    citizen.unmount();

    // Official: assigns the complaint to the demo worker.
    {
      const { user, unmount } = await loginAs(/government official/i);
      await user.click((await screen.findAllByRole("button", { name: /^Complaints/ }))[0]);
      await onPage("Complaints");
      await user.click(screen.getAllByText(citizen.created.id, { exact: false })[0]);
      await waitFor(() => expect(path()).toBe(`/official/complaints/${citizen.created.id}`));
      await screen.findByText("Assign Worker");
      const select = screen.getAllByRole("combobox").find((s) => within(s).queryByRole("option", { name: /^Vikash Kumar/ }));
      await user.selectOptions(select, "w1");
      await user.click(screen.getByRole("button", { name: "Assign Complaint" }));
      await waitFor(() => expect(getComplaints().find((c) => c.id === citizen.created.id)).toMatchObject({ status: "ASSIGNED", assignedWorkerName: "Vikash Kumar" }));
      unmount();
    }

    // Worker: sees the task, starts it, raises a facility request.
    {
      const { user, unmount } = await loginAs(/sanitation worker/i);
      await onPage("Dashboard");
      expect(screen.getByText(`#${citizen.created.id}`)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^Tasks/ }));
      await onPage("My Tasks");
      await user.click(screen.getAllByText(citizen.created.id, { exact: false })[0]);
      await onPage("Task Details");
      await user.click(screen.getByRole("button", { name: "Start Work" }));
      await waitFor(() => expect(getComplaints().find((c) => c.id === citizen.created.id).status).toBe("IN_PROGRESS"));

      await user.click(screen.getByRole("button", { name: /^Home/ }));
      await onPage("Dashboard");
      await user.click(screen.getAllByRole("button", { name: /Request (a )?Facility/i })[0]);
      await waitFor(() => expect(path()).toBe("/worker/facility-request"));
      await onPage("Request Facility");
      await user.click(screen.getByRole("button", { name: /Dustbin/ }));
      await user.type(screen.getByLabelText("Suggested Name"), "Dustbin near the market gate");
      await user.click(screen.getByRole("button", { name: "Enter Lat/Lng" }));
      await user.type(screen.getByLabelText("Latitude"), "29.8560");
      await user.type(screen.getByLabelText("Longitude"), "77.8900");
      await user.type(screen.getByLabelText("Address / Location Description"), "Civil Lines market gate");
      await user.type(screen.getByLabelText("Reason for Requirement"), "Shoppers leave waste at the gate");
      await user.click(screen.getByRole("button", { name: "Submit Request" }));
      await waitFor(() => expect(path()).toMatch(/^\/worker\/facility-requests\/FR-/));
      await onPage("Request Details");
      unmount();
    }

    // Official: approves the request, then adds a bin directly.
    {
      const { user, unmount } = await loginAs(/government official/i);
      await user.click((await screen.findAllByRole("button", { name: /Facility Requests/ }))[0]);
      await onPage("Facility Requests");
      const card = (await screen.findByText("Dustbin near the market gate")).closest("article, li, div.rounded-2xl");
      await user.click(within(card).getByRole("button", { name: "Approve" }));
      expect(await within(card).findByText(/Approved — now on the shared map/)).toBeInTheDocument();
      expect(getFacilityRequests().find((r) => r.suggestedName === "Dustbin near the market gate").status).toBe("APPROVED");

      await user.click(screen.getAllByRole("button", { name: /^Bins/ })[0]);
      await onPage("Bins");
      await user.click(screen.getAllByRole("button", { name: /Add Facility/ })[0]);
      await waitFor(() => expect(path()).toBe("/official/add-facility"));
      await onPage("Add Facility");
      await user.type(screen.getByLabelText("Name"), "Bus stand bin");
      await user.selectOptions(screen.getByLabelText("Status"), "almost_full");
      await user.type(screen.getByLabelText("Address"), "Roorkee bus stand");
      await user.clear(screen.getByLabelText("Latitude"));
      await user.type(screen.getByLabelText("Latitude"), "29.8660");
      await user.clear(screen.getByLabelText("Longitude"));
      await user.type(screen.getByLabelText("Longitude"), "77.8910");
      await user.click(screen.getByRole("button", { name: "Save Facility" }));
      expect(await screen.findByText("Facility saved")).toBeInTheDocument();
      unmount();
    }

    for (const role of ["citizen", "worker", "official"]) {
      startSession(role, "");
      await refreshFresh();
      const names = getAllBins().map((b) => b.name);
      expect(names).toEqual(expect.arrayContaining(["Bus stand bin", "Dustbin near the market gate"]));
      expect(getAllBins().find((b) => b.name === "Bus stand bin")).toMatchObject({ status: "almost_full" });
    }

    // Citizen: the complaint shows the worker's update, and a notification is waiting.
    {
      const { user } = await loginAs(CITIZEN);
      await onPage(GREETING);
      expect(screen.getByRole("button", { name: /Notifications, \d+ unread/ })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Notifications/ }));
      await onPage("Notifications");
      expect(screen.getByText(`Vikash Kumar is working on complaint ${citizen.created.id}`)).toBeInTheDocument();
    }
  }, 30000);
});
