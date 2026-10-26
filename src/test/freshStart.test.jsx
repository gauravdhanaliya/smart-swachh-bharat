import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./renderApp";
import { getComplaints } from "../services/complaintService";
import { getFacilityRequests } from "../services/facilityRequestService";
import { getAllBins, getAllBuildings, getAllToilets } from "../services/facilityService";
import { refreshFresh } from "../services/locationStore";
import { getAllWorkers } from "../services/workerService";
import { clearSession, startSession } from "../services/authSession";
import { DATA_VERSION, DATA_VERSION_KEY, ensureDataVersion } from "../services/dataReset";
import { getProfile, hasProfile, saveProfile, validateProfile } from "../services/profileService";
import { CITIES } from "../data/cities";

const CITY = CITIES.find((c) => c.id === "roorkee-uk");
const profiles = {
  citizen: { fullName: "Asha Verma", mobile: "9876543210", cityId: CITY.id, ward: "Ward 7", address: "12 Civil Lines" },
  worker: { fullName: "Ravi Kumar", mobile: "", cityId: CITY.id, zone: "Zone 3", employeeId: "EMP-42" },
  official: { fullName: "Meera Iyer", mobile: "", cityId: CITY.id, department: "Municipal Corporation", designation: "Sanitation Officer" },
};
const CARD = { citizen: "Citizen", worker: "Sanitation Worker", official: "Government Official" };

// Taps a role card on the login page, as a signed-out visitor would.
async function tapRole(role) {
  clearSession();
  const user = userEvent.setup();
  const app = renderApp("/login");
  await user.click(screen.getByRole("button", { name: new RegExp(`^${CARD[role]}`) }));
  return { ...app, user };
}

describe("login page", () => {
  it("has no name field and shows only the heading, subtitle and three role cards", () => {
    const { container } = renderApp("/login");
    expect(screen.queryByLabelText(/your name/i)).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.getByText("Welcome Back!")).toBeInTheDocument();
    expect(screen.getByText("Choose your role to continue")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(Citizen|Sanitation Worker|Government Official)/ })).toHaveLength(3);
    expect(screen.queryByText(/A Cleaner India/)).toBeNull();
    expect(screen.getByText(/Clean Cities\s+\|\s+Green Tomorrow/)).toBeInTheDocument();
  });
});

describe("fresh start: no seed data", () => {
  it("has no complaints, facility requests, bins, toilets, buildings or workers", async () => {
    expect(getComplaints()).toEqual([]);
    for (const role of ["citizen", "worker", "official"]) {
      startSession(role);
      await refreshFresh();
      expect(getAllBins()).toEqual([]);
      expect(getAllToilets()).toEqual([]);
      expect(getAllBuildings()).toEqual([]);
    }
    expect(getFacilityRequests()).toEqual([]);
    expect(getAllWorkers()).toEqual([]);
  });
});

describe("data version reset", () => {
  it("clears every EcoSetu key once when the stored version differs, and keeps other sites' keys", () => {
    localStorage.setItem("ssb_complaints_v1", "[1]");
    localStorage.setItem("ssb_auth_session_v1", "{}");
    localStorage.setItem("ecosetu_profiles_v1", "{}");
    localStorage.setItem("unrelated_key", "keep me");
    sessionStorage.setItem("ssb_gps_ack_v1", "1");

    expect(ensureDataVersion()).toBe(true);
    expect(localStorage.getItem("ssb_complaints_v1")).toBeNull();
    expect(localStorage.getItem("ssb_auth_session_v1")).toBeNull();
    expect(localStorage.getItem("ecosetu_profiles_v1")).toBeNull();
    expect(sessionStorage.getItem("ssb_gps_ack_v1")).toBeNull();
    expect(localStorage.getItem("unrelated_key")).toBe("keep me");
    expect(localStorage.getItem(DATA_VERSION_KEY)).toBe(String(DATA_VERSION));

    localStorage.setItem("ssb_complaints_v1", "[]");
    expect(ensureDataVersion()).toBe(false);
    expect(localStorage.getItem("ssb_complaints_v1")).toBe("[]");
  });
});

describe("profile validation", () => {
  it("requires name and city, and checks the mobile number", () => {
    expect(validateProfile("citizen", { fullName: "", cityId: "" })).toEqual(
      expect.objectContaining({ fullName: expect.any(String), cityId: expect.any(String) })
    );
    expect(validateProfile("citizen", { ...profiles.citizen, mobile: "12345" })).toHaveProperty("mobile");
    expect(validateProfile("citizen", { ...profiles.citizen, mobile: "" })).toEqual({});
    expect(validateProfile("citizen", profiles.citizen)).toEqual({});
  });

  it("requires the worker's ward or zone", () => {
    expect(validateProfile("worker", { ...profiles.worker, zone: " " })).toHaveProperty("zone");
    expect(validateProfile("worker", profiles.worker)).toEqual({});
  });

  it("saves per role and stores the city details", () => {
    saveProfile("official", profiles.official);
    expect(hasProfile("official")).toBe(true);
    expect(hasProfile("citizen")).toBe(false);
    expect(getProfile("official")).toMatchObject({ fullName: "Meera Iyer", city: { name: "Roorkee", state: CITY.state } });
  });
});

describe("first-login profile setup", () => {
  it.each(["citizen", "worker", "official"])("%s: first login opens the setup form, returning login skips it", async (role) => {
    const { location, unmount } = await tapRole(role);
    expect(location.current.pathname).toBe("/profile/setup");
    expect(await screen.findByRole("heading", { name: "Complete your profile" })).toBeInTheDocument();
    unmount();

    saveProfile(role, profiles[role]);
    const again = await tapRole(role);
    expect(again.location.current.pathname).toBe(`/${role}`);
  });

  it("a dashboard URL without a saved profile sends the user to setup", async () => {
    startSession("worker");
    const { location } = renderApp("/worker/tasks");
    await waitFor(() => expect(location.current.pathname).toBe("/profile/setup"));
  });

  it("shows inline errors, then saves and opens the dashboard with the citizen's name", async () => {
    const { user, location } = await tapRole("citizen");
    await screen.findByRole("heading", { name: "Complete your profile" });
    await user.type(screen.getByLabelText(/Mobile/), "123");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(screen.getByText("Please enter your full name.")).toBeInTheDocument();
    expect(screen.getByText("Please choose your city.")).toBeInTheDocument();
    expect(screen.getByText("Enter a 10-digit mobile number, or leave it blank.")).toBeInTheDocument();
    expect(location.current.pathname).toBe("/profile/setup");

    await user.type(screen.getByLabelText(/Full name/), "Asha Verma");
    await user.clear(screen.getByLabelText(/Mobile/));
    await user.click(screen.getByRole("button", { name: /Choose your city/ }));
    await user.type(screen.getByPlaceholderText(/Search/), "Roorkee");
    await user.click(await screen.findByRole("button", { name: /^Roorkee/ }));
    await user.type(screen.getByLabelText(/Ward or locality/), "Ward 7");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    await waitFor(() => expect(location.current.pathname).toBe("/citizen"));
    expect(await screen.findByRole("heading", { name: /, Asha!$/ })).toBeInTheDocument();
    expect(screen.queryByText(/Citizen!/)).toBeNull();
    expect(getProfile("citizen")).toMatchObject({ fullName: "Asha Verma", ward: "Ward 7", city: { name: "Roorkee" } });
  });

  it("Edit details on the profile page reopens the form pre-filled", async () => {
    saveProfile("worker", profiles.worker);
    startSession("worker");
    const user = userEvent.setup();
    const { location } = renderApp("/worker/profile");
    expect(await screen.findAllByText("Ravi Kumar")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    expect(location.current.pathname).toBe("/profile/setup");
    expect(await screen.findByLabelText(/Full name/)).toHaveValue("Ravi Kumar");
    expect(screen.getByLabelText(/ward or zone/i)).toHaveValue("Zone 3");
    await user.clear(screen.getByLabelText(/Full name/));
    await user.type(screen.getByLabelText(/Full name/), "Ravi K.");
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(location.current.pathname).toBe("/worker/profile"));
    expect(getProfile("worker").fullName).toBe("Ravi K.");
  });
});

describe("profiles drive identity across roles", () => {
  it("the worker's profile is in the official's worker list and can be assigned a complaint", async () => {
    saveProfile("worker", profiles.worker);
    saveProfile("official", profiles.official);
    expect(getAllWorkers()).toEqual([expect.objectContaining({ id: "w1", name: "Ravi Kumar", area: "Zone 3" })]);

    localStorage.setItem(
      "ssb_complaints_v1",
      JSON.stringify([{ id: "SSB2026-0001", citizenName: "Asha Verma", issueType: "Dirty Area", description: "Garbage pile by the market", location: { address: "Market", latitude: CITY.latitude, longitude: CITY.longitude }, priority: "MEDIUM", status: "SUBMITTED", assignedWorkerId: null, assignedWorkerName: null, resolutionNote: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])
    );
    startSession("official");
    const user = userEvent.setup();
    const { unmount } = renderApp("/official/complaints/SSB2026-0001");
    // The page has a Priority select too; take the one listing workers.
    await screen.findByText("Assign Worker");
    const select = screen.getAllByRole("combobox").find((s) => within(s).queryByRole("option", { name: /Ravi Kumar/ }));
    expect(select).toBeTruthy();
    expect(within(select).getByRole("option", { name: /Ravi Kumar — Zone 3/ })).toBeInTheDocument();
    await user.selectOptions(select, "w1");
    await user.click(screen.getByRole("button", { name: "Assign Complaint" }));
    expect(getComplaints()[0]).toMatchObject({ status: "ASSIGNED", assignedWorkerId: "w1", assignedWorkerName: "Ravi Kumar" });
    unmount();

    startSession("worker");
    renderApp("/worker/tasks");
    expect(await screen.findByText(/SSB2026-0001/)).toBeInTheDocument();
  });

  it("the official's name and city appear in the header and dashboard", async () => {
    saveProfile("official", profiles.official);
    startSession("official");
    renderApp("/official");
    expect((await screen.findAllByText("Meera Iyer")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Roorkee/)).toBeInTheDocument();
    expect(screen.queryByText(/Haridwar District|District Officer/)).toBeNull();
  });
});

describe("Reset all data", () => {
  it.each([
    ["citizen", "/citizen/profile"],
    ["worker", "/worker/profile"],
    ["official", "/official/profile"],
  ])("%s: confirm wipes every EcoSetu key, logs out, and the next login asks for a profile again", async (role, path) => {
    for (const r of ["citizen", "worker", "official"]) saveProfile(r, profiles[r]);
    localStorage.setItem("ssb_complaints_v1", "[]");
    startSession(role);
    const user = userEvent.setup();
    const { location, unmount } = renderApp(path);
    await user.click(await screen.findByRole("button", { name: "Reset all data" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(hasProfile(role)).toBe(true);

    await user.click(screen.getByRole("button", { name: "Reset all data" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Yes, reset everything" }));
    await waitFor(() => expect(location.current.pathname).toBe("/login"));
    const left = Object.keys(localStorage).filter((k) => k.startsWith("ssb_") || (k.startsWith("ecosetu_") && k !== DATA_VERSION_KEY));
    expect(left).toEqual([]);
    for (const r of ["citizen", "worker", "official"]) expect(hasProfile(r)).toBe(false);
    unmount();

    const again = await tapRole(role);
    expect(again.location.current.pathname).toBe("/profile/setup");
  });
});

describe("empty states with no data", () => {
  const setup = (role) => {
    saveProfile(role, profiles[role]);
    startSession(role);
  };

  it("citizen dashboard shows 0 everywhere and no bell badge", async () => {
    setup("citizen");
    renderApp("/citizen");
    await screen.findByRole("heading", { name: /, Asha!$/ });
    for (const label of ["Total Bins Nearby", "Bins Need Collection", "Overflowing Bins", "Complaints Resolved", "Total Complaints"]) {
      expect(screen.getByText(label).closest("button, div").textContent).toMatch(/(^|\D)0(\D|$)/);
    }
    expect(screen.getByText("No bins or toilets in this city yet.")).toBeInTheDocument();
    expect(screen.queryByText(/demo data/i)).toBeNull();
    const bell = screen.getByRole("button", { name: /notifications/i });
    expect(bell.textContent.replace(/\D/g, "")).toBe("");
  });

  it("citizen complaints list invites the first report", async () => {
    setup("citizen");
    const user = userEvent.setup();
    const { location } = renderApp("/citizen/complaints");
    expect(await screen.findByText("No complaints yet. Report your first issue.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Report Issue" }));
    expect(location.current.pathname).toBe("/citizen/report");
  });

  it("citizen map says there are no facilities in the city", async () => {
    setup("citizen");
    renderApp("/citizen/map");
    expect(await screen.findByText("No bins or toilets in this city yet.")).toBeInTheDocument();
  });

  it("worker dashboard shows 0 and the task list says none are assigned", async () => {
    setup("worker");
    const { unmount } = renderApp("/worker");
    await screen.findByRole("heading", { name: "Dashboard" });
    for (const label of ["Assigned Tasks", "New Tasks", "In Progress", "Completed"]) {
      expect(screen.getByText(label).previousElementSibling.textContent).toBe("0");
    }
    unmount();
    renderApp("/worker/tasks");
    expect(await screen.findByText("No tasks assigned yet.")).toBeInTheDocument();
  });

  it("official dashboard shows 0 and the lists show their empty states", async () => {
    setup("official");
    const user = userEvent.setup();
    const { location, unmount } = renderApp("/official");
    expect(await screen.findByText("No complaints or facility requests yet.")).toBeInTheDocument();
    expect(screen.getByText("Total Complaints").previousElementSibling.textContent).toBe("0");
    unmount();

    const complaints = renderApp("/official/complaints");
    expect(await screen.findByText("No complaints or facility requests yet.")).toBeInTheDocument();
    complaints.unmount();

    const requests = renderApp("/official/facility-requests");
    expect(await screen.findByText("No complaints or facility requests yet.")).toBeInTheDocument();
    requests.unmount();

    const bins = renderApp("/official/bins");
    expect(await screen.findByText("No bins or toilets added yet.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Add Facility/ }).at(-1));
    await waitFor(() => expect(bins.location.current.pathname).toBe("/official/add-facility"));
    void location;
  });
});

describe("city list", () => {
  it("has no duplicate cities", () => {
    const keys = CITIES.map((c) => `${c.name}|${c.state}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
