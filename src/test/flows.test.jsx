import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, withProfiles } from "./renderApp";
import { getComplaints } from "../services/complaintService";
import { getFacilityRequests } from "../services/facilityRequestService";
import { getAllBins } from "../services/facilityService";
import { refreshFresh } from "../services/locationStore";
import { clearSession, startSession } from "../services/authSession";

// GPS that answers immediately with a sharp fix in Roorkee (the test profiles' city).
function fakeGps() {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: (onFix) => {
        onFix({ coords: { latitude: 29.8543, longitude: 77.888, accuracy: 5 } });
        return 1;
      },
      clearWatch: () => {},
      getCurrentPosition: (onFix) => onFix({ coords: { latitude: 29.8543, longitude: 77.888, accuracy: 5 } }),
    },
  });
}

/** A returning user (profile already saved) signs in through the real login page. */
async function loginAs(cardTitle) {
  clearSession();
  const user = userEvent.setup();
  const app = renderApp("/login");
  await user.click(screen.getByRole("button", { name: new RegExp(`^${cardTitle}`) }));
  return { ...app, user };
}

// Pages load lazily and the previous page stays on screen until the next one
// arrives, so every navigation waits for the new page's heading.
const onPage = (name) => screen.findByRole("heading", { name });

const tileValue = async (label) => (await screen.findByText(label)).previousElementSibling.textContent;

async function citizenReports(description) {
  fakeGps();
  const { user, location, unmount } = await loginAs("Citizen");
  expect(location.current.pathname).toBe("/citizen");
  await onPage(/, Asha!$/);
  const totalBefore = Number(await tileValue("Total Complaints"));

  await user.click(screen.getByRole("button", { name: "Quick Actions" }));
  await user.click(screen.getByRole("button", { name: /Report Issue/ }));
  expect(location.current.pathname).toBe("/citizen/report");
  // Until it loads, the dashboard (with its "Overflowing Bins" tile) is still on screen.
  await onPage("Report an Issue");
  await user.click(screen.getByRole("button", { name: /Overflowing Bin$/ }));
  // The map's corner icon and the full-width button both start GPS; use the button.
  await user.click(screen.getAllByRole("button", { name: "Use my current location" }).at(-1));
  const allow = screen.queryByRole("button", { name: "Allow and fetch location" });
  if (allow) await user.click(allow);
  await user.type(screen.getByPlaceholderText("Write more about the issue…"), description);
  await user.click(screen.getByRole("button", { name: "Submit Report" }));

  await waitFor(() => expect(location.current.pathname).toMatch(/^\/citizen\/complaints\/SSB/));
  await onPage("Complaint Tracking");
  const created = getComplaints().find((c) => c.description === description);
  expect(created).toMatchObject({ citizenName: "Asha Verma", citizenMobile: "9876543210", issueType: "Overflowing Bin", status: "SUBMITTED" });
  return { user, location, unmount, created, totalBefore };
}

async function officialAssigns(complaintId) {
  const { user, location, unmount } = await loginAs("Government Official");
  await user.click((await screen.findAllByRole("button", { name: /^Complaints/ }))[0]);
  await onPage("Complaints");
  await user.click(screen.getAllByText(complaintId, { exact: false })[0]);
  await waitFor(() => expect(location.current.pathname).toBe(`/official/complaints/${complaintId}`));
  await screen.findByText("Assign Worker");
  const select = screen.getAllByRole("combobox").find((s) => within(s).queryByRole("option", { name: /Ravi Kumar — Zone 3/ }));
  await user.selectOptions(select, "w1");
  await user.click(screen.getByRole("button", { name: "Assign Complaint" }));
  expect(getComplaints().find((c) => c.id === complaintId)).toMatchObject({ status: "ASSIGNED", assignedWorkerName: "Ravi Kumar" });
  unmount();
}

async function raiseFacilityRequest(user, location, name) {
  if (location.current.pathname !== "/worker") {
    await user.click(screen.getByRole("button", { name: /^Home/ }));
  }
  await onPage("Dashboard");
  await user.click(screen.getAllByRole("button", { name: /Request (a )?Facility/i })[0]);
  expect(location.current.pathname).toBe("/worker/facility-request");
  await onPage("Request Facility");

  await user.click(screen.getByRole("button", { name: /Dustbin/ }));
  await user.type(screen.getByLabelText("Suggested Name"), name);
  await user.click(screen.getByRole("button", { name: "Enter Lat/Lng" }));
  await user.type(screen.getByLabelText("Latitude"), "29.8560");
  await user.type(screen.getByLabelText("Longitude"), "77.8900");
  await user.type(screen.getByLabelText("Address / Location Description"), "Civil Lines market gate");
  await user.type(screen.getByLabelText("Reason for Requirement"), "Shoppers leave waste at the gate");
  await user.click(screen.getByRole("button", { name: "Submit Request" }));
  await waitFor(() => expect(location.current.pathname).toMatch(/^\/worker\/facility-requests\/FR-/));
  await onPage("Request Details");
}

describe("citizen flow", () => {
  it("dashboard starts at 0; a report shows in Complaints and the count goes to 1", async () => {
    withProfiles();
    const description = "Bin at the gate is overflowing badly";
    const { user, location, created, totalBefore } = await citizenReports(description);
    expect(totalBefore).toBe(0);

    await user.click(within(screen.getByRole("navigation")).getByRole("button", { name: /^Complaints/ }));
    expect(location.current.pathname).toBe("/citizen/complaints");
    await onPage("My Complaints");
    expect(screen.getByText(created.id, { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Home/ }));
    await onPage(/, Asha!$/);
    expect(Number(await tileValue("Total Complaints"))).toBe(1);
  });
});

describe("the whole flow across roles", () => {
  it("citizen reports → official assigns → worker starts it and raises a request → official approves and adds a bin → everyone sees it", async () => {
    withProfiles();
    const citizen = await citizenReports("Garbage dumped next to the canteen");
    citizen.unmount();

    await officialAssigns(citizen.created.id);

    // Worker: sees the task, starts it, raises a facility request.
    const worker = await loginAs("Sanitation Worker");
    await onPage("Dashboard");
    expect(screen.getByText("Assigned Tasks").previousElementSibling.textContent).toBe("1");
    await worker.user.click(screen.getByRole("button", { name: /^Tasks/ }));
    await onPage("My Tasks");
    await worker.user.click(screen.getAllByText(citizen.created.id, { exact: false })[0]);
    await onPage("Task Details");
    await worker.user.click(screen.getByRole("button", { name: "Start Work" }));
    await waitFor(() => expect(getComplaints()[0].status).toBe("IN_PROGRESS"));
    await raiseFacilityRequest(worker.user, worker.location, "Dustbin near the market gate");
    worker.unmount();

    // Official: sees the complaint and the request, approves it, adds a bin directly.
    const { user, location, unmount } = await loginAs("Government Official");
    await user.click((await screen.findAllByRole("button", { name: /^Complaints/ }))[0]);
    await onPage("Complaints");
    expect(screen.getAllByText(citizen.created.id, { exact: false }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: /Facility Requests/ })[0]);
    await onPage("Facility Requests");
    const card = (await screen.findByText("Dustbin near the market gate")).closest("article, li, div.rounded-2xl");
    await user.click(within(card).getByRole("button", { name: "Approve" }));
    expect(await within(card).findByText(/Approved — now on the shared map/)).toBeInTheDocument();
    expect(getFacilityRequests()[0].status).toBe("APPROVED");

    await user.click(screen.getAllByRole("button", { name: /^Bins/ })[0]);
    await onPage("Bins");
    await user.click(screen.getAllByRole("button", { name: /Add Facility/ })[0]);
    await waitFor(() => expect(location.current.pathname).toBe("/official/add-facility"));
    await onPage("Add Facility");
    await user.type(screen.getByLabelText("Name"), "Bus stand bin");
    await user.type(screen.getByLabelText("Address"), "Roorkee bus stand");
    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "29.8660");
    await user.clear(screen.getByLabelText("Longitude"));
    await user.type(screen.getByLabelText("Longitude"), "77.8910");
    await user.click(screen.getByRole("button", { name: "Save Facility" }));
    expect(await screen.findByText("Facility saved")).toBeInTheDocument();
    unmount();

    for (const role of ["citizen", "worker", "official"]) {
      startSession(role);
      await refreshFresh();
      expect(getAllBins().map((b) => b.name).sort()).toEqual(["Bus stand bin", "Dustbin near the market gate"]);
    }

    // Citizen: the complaint shows the worker's update, and a notification is waiting.
    const back = await loginAs("Citizen");
    await onPage(/, Asha!$/);
    expect(screen.getByRole("button", { name: /Notifications, \d+ unread/ })).toBeInTheDocument();
    await back.user.click(screen.getByRole("button", { name: /Notifications/ }));
    await onPage("Notifications");
    expect(screen.getByText(`Ravi Kumar is working on complaint ${citizen.created.id}`)).toBeInTheDocument();
    expect(Number(await tileValueAfterHome(back.user))).toBe(1);
  }, 30000);
});

async function tileValueAfterHome(user) {
  await user.click(screen.getByRole("button", { name: /^Home/ }));
  await onPage(/, Asha!$/);
  return tileValue("Total Complaints");
}

describe("route isolation", () => {
  it.each([
    ["Citizen", "/citizen", ["/worker", "/worker/tasks", "/official", "/official/facility-requests"]],
    ["Sanitation Worker", "/worker", ["/citizen", "/citizen/report", "/official", "/official/workers"]],
    ["Government Official", "/official", ["/citizen", "/citizen/complaints", "/worker", "/worker/facility-request"]],
  ])("%s can't open another role's routes", async (card, home, others) => {
    withProfiles();
    const first = await loginAs(card);
    first.unmount();
    for (const path of others) {
      const { location, unmount } = renderApp(path);
      expect(location.current.pathname).toBe(home);
      unmount();
    }
  });
});
