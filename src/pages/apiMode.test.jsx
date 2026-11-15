// The app's main journeys, run twice: against the real EcoSetu API (a child
// process with an in-memory MongoDB and a mocked Blob store) with
// VITE_USE_API=true, and against the browser-only build with it false.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({
  default: ({ bins = [], toilets = [] }) => (
    <ul data-testid="facility-map">
      {[...bins, ...toilets].map((f) => (
        <li key={f.id}>{`pin ${f.id} ${f.name}`}</li>
      ))}
    </ul>
  ),
}));

import App from "../App";
import { resetSessionClientForTests, getSessionClient } from "../services/session";
import { startSession } from "../services/authSession";
import { resetStore } from "../services/locationStore";
import { createComplaint, assignComplaint, getComplaintById, resetComplaintCache, refreshComplaints } from "../services/complaintService";
import { createFacilityRequest, updateFacilityRequestStatus } from "../services/facilityRequestService";
import { addWorker, refreshWorkers, resetWorkerCache } from "../services/workerService";
import { updateGovProfile, refreshGovProfile, resetGovProfileCache } from "../services/govProfileService";
import { reset as resetNotifications } from "../services/notificationRemote";
import { DEMO_BINS, DEMO_TOILETS } from "../../server/src/seed-data.js";
import { resetRatingCache } from "../services/toiletRatingService";
import { startLiveServer } from "../test/liveServer";
import { LOCAL_CONSENT_KEY, acceptConsentLocally, firstVisit } from "../test/consent";
import { DEFAULT_CONSENT_VERSION } from "../../server/src/constants.js";

const DEMO_CONSENT = { locationWhenReporting: true, photosAttached: true, readNotice: true };

const DEMO_NAMES = { citizen: "Demo Citizen", worker: "Vikash Kumar", official: "Demo Official" };
const GENERAL = {
  citizenName: "Demo Citizen",
  issueType: "Dirty Area",
  description: "Rubbish piled up near the library entrance",
  location: { address: "Central Library, COER University", latitude: 29.8909, longitude: 77.9604 },
  priority: "MEDIUM",
  photo: null,
};
const JPEG = `data:image/jpeg;base64,${btoa("fake jpeg bytes for the test")}`;

let live;

beforeAll(async () => {
  live = await startLiveServer();
}, 120_000);

afterAll(async () => {
  await live?.stop();
});

function Probe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}
const path = () => screen.getByTestId("path").textContent;

function renderAt(at) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <App />
      <Probe />
    </MemoryRouter>
  );
}

describe.each([
  ["through the API", true],
  ["in the browser-only build", false],
])("%s", (_label, useApi) => {
  // Signs in the way each build does, outside the UI.
  async function signInAs(role) {
    if (useApi) {
      await getSessionClient().loginDemo(role);
      // the consent screen has its own journey below; here the account has agreed
      await getSessionClient().request("/api/me/consent", { method: "PUT", body: { version: DEFAULT_CONSENT_VERSION, items: DEMO_CONSENT } });
    } else {
      acceptConsentLocally(startSession(role, DEMO_NAMES[role]));
    }
    resetStore();
    resetComplaintCache();
    resetGovProfileCache();
    resetWorkerCache();
    resetNotifications();
  }

  beforeEach(() => {
    vi.stubEnv("VITE_USE_API", useApi ? "true" : "false");
    live.clearCookies();
    live.setOffline(null);
    resetSessionClientForTests({ fetch: live.fetch, locks: null, createChannel: () => null });
    resetStore();
    resetComplaintCache();
    // OpenStreetMap lookups on the map screens: no internet in tests.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  });

  afterEach(async () => {
    // Background work this test started (polls, the sign-in refresh) must not
    // run on into the next test with this test's session client.
    await live.idle();
    resetSessionClientForTests();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("an account without an agreement is asked for consent once, then the citizen dashboard opens", async () => {
    firstVisit(); // nothing agreed on the start screen either (e.g. signed in by an earlier build)
    // Signed in outside the UI: the silent anonymous sign-in itself is covered by
    // server/test/citizen-auth.test.js (real tokens) and apiAuth.test.jsx.
    if (useApi) {
      await getSessionClient().loginDemo("citizen");
      // a demo account may already have agreed in an earlier test: ask again
      await getSessionClient().request("/api/me/consent/reset-demo", { method: "POST" });
    } else {
      startSession("citizen", DEMO_NAMES.citizen);
    }
    resetStore();
    const user = userEvent.setup();
    renderAt("/citizen");
    expect(await screen.findByRole("heading", { level: 1, name: "Before you start" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    for (const name of [/location access/i, /photos i upload/i, /read the privacy notice/i]) {
      await user.click(screen.getByRole("checkbox", { name }));
    }
    await user.click(screen.getByRole("button", { name: "Agree and continue" }));
    expect(await screen.findByRole("heading", { level: 1, name: /^Hello/ })).toBeInTheDocument();
    if (useApi) expect(live.calls.some((c) => c.method === "PUT" && c.path === "/api/me/consent")).toBe(true);
    else expect(JSON.parse(localStorage.getItem(LOCAL_CONSENT_KEY))["demo-citizen"]).toMatchObject({ items: DEMO_CONSENT });
  });

  it("withdraw consent: signed out with the data kept, and asked again at the next sign-in", async () => {
    await signInAs("citizen");
    const user = userEvent.setup();
    renderAt("/account/withdraw");
    await user.click(await screen.findByRole("button", { name: "Withdraw and sign out" }));
    await waitFor(() => expect(path()).toBe("/login"));
    expect(screen.getByRole("alert")).toHaveTextContent(/your data is kept/i);
    if (useApi) {
      expect(live.calls.some((c) => c.method === "DELETE" && c.path === "/api/me/consent")).toBe(true);
      await getSessionClient().loginDemo("citizen");
      expect((await getSessionClient().request("/api/me/consent")).upToDate).toBe(false);
    } else {
      expect(JSON.parse(localStorage.getItem(LOCAL_CONSENT_KEY))["demo-citizen"]).toBeUndefined();
    }
    if (useApi) expect(live.calls.some((c) => c.path === "/api/auth/demo")).toBe(true);
  });

  it("map: the seeded demo bins appear", async () => {
    await signInAs("citizen");
    const before = live.calls.length;
    renderAt("/citizen/map");
    expect(await screen.findByText(`pin ${DEMO_BINS[0].id} ${DEMO_BINS[0].name}`)).toBeInTheDocument();
    if (useApi) {
      const mine = live.calls.slice(before).map((c) => c.path);
      expect(mine).toContain("/api/locations/map");
      // the map gets its bins and toilets in one call, not by walking pages
      expect(mine.filter((p) => p.startsWith("/api/locations?") && !p.includes("kind=building"))).toEqual([]);
    }
  });

  it("ratings: a citizen rates a toilet and the average updates", async () => {
    await signInAs("citizen");
    resetRatingCache();
    const user = userEvent.setup();
    renderAt(`/citizen/toilet/${DEMO_TOILETS[0].id}`);
    const form = await screen.findByRole("form", { name: /rate this toilet|update your rating/i });
    await user.click(within(form).getByRole("radio", { name: "3 stars" }));
    await user.type(within(form).getByLabelText(/comment/i), "Needs more water");
    await user.click(within(form).getByRole("button", { name: /submit rating|update rating/i }));
    expect(await screen.findByText(/your rating is saved/i)).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Ratings" });
    expect(within(summary).getByText("3.0")).toBeInTheDocument();
    expect(await within(summary).findByText("Needs more water")).toBeInTheDocument();
    if (useApi) expect(live.calls.some((c) => c.method === "PUT" && c.path === `/api/toilets/${DEMO_TOILETS[0].id}/rating`)).toBe(true);
  });

  it("bin details: the full record is shown (fetched on demand through the API)", async () => {
    await signInAs("citizen");
    renderAt(`/citizen/bin/${DEMO_BINS[0].id}`);
    expect(await screen.findByText(DEMO_BINS[0].address)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: new RegExp(`${DEMO_BINS[0].details.wasteType} Bin`, "i") })).toBeInTheDocument();
  });

  it("complaints: a citizen's report shows in their list, then in the assigned worker's tasks", async () => {
    await signInAs("citizen");
    const complaint = await createComplaint(GENERAL);
    expect(complaint.id).toMatch(/^SSB2026-/);
    const view = renderAt("/citizen/complaints");
    expect(await screen.findByText(`#${complaint.id}`, { exact: false })).toBeInTheDocument();
    view.unmount();

    await signInAs("official");
    await refreshComplaints();
    await assignComplaint(complaint.id, "w1", "Vikash Kumar");

    await signInAs("worker");
    renderAt("/worker/tasks");
    expect(await screen.findByText(`#${complaint.id}`, { exact: false })).toBeInTheDocument();
  });

  it("facility requests: a worker's request reaches the official, and approving it puts it on the map", async () => {
    await signInAs("worker");
    const name = `Request ${useApi ? "api" : "local"} ${Date.now()}`;
    const request = await createFacilityRequest({
      facilityType: "Dustbin",
      suggestedName: name,
      location: { address: "Workshop road", latitude: 29.8899, longitude: 77.96 },
      reason: "Waste piles up here daily",
      description: "",
      priority: "HIGH",
      photo: null,
      requestedByWorkerId: "w1",
      requestedByWorkerName: "Vikash Kumar",
    });

    await signInAs("official");
    const view = renderAt("/official/facility-requests");
    expect(await screen.findByText(name)).toBeInTheDocument();
    view.unmount();

    await updateFacilityRequestStatus(request.id, "APPROVED");
    await signInAs("citizen");
    renderAt("/citizen/map");
    expect(await screen.findByText(new RegExp(`^pin DB-\\d+ ${name}$`))).toBeInTheDocument();
  });

  it("notifications: the citizen sees their complaint's assignment in their notifications", async () => {
    await signInAs("citizen");
    // Through the API the server records who filed it; the browser-only build takes it from the form.
    const complaint = await createComplaint(useApi ? GENERAL : { ...GENERAL, citizenId: "demo-citizen" });
    await signInAs("official");
    await refreshComplaints();
    await assignComplaint(complaint.id, "w1", "Vikash Kumar");
    await signInAs("citizen");
    const before = live.calls.length;
    renderAt("/citizen/notifications");
    expect(await screen.findByText(`Complaint ${complaint.id} assigned to Vikash Kumar`)).toBeInTheDocument();
    if (useApi) {
      const paths = live.calls.slice(before).map((c) => c.path);
      expect(paths.some((p) => p.startsWith("/api/notifications"))).toBe(true);
      await waitFor(() => expect(live.calls.some((c) => c.method === "POST" && c.path === "/api/notifications/read-all")).toBe(true));
    }
  });

  it("workers: an official adds a worker and sees them in the directory", async () => {
    await signInAs("official");
    const name = `Meena ${useApi ? "api" : "local"}`;
    const email = useApi ? "meena.api@example.test" : "meena.local@example.test";
    await addWorker({ name, email, area: "Ganeshpur", status: "Available" });
    await refreshWorkers();
    renderAt("/official/workers");
    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(screen.getByText("Vikash Kumar")).toBeInTheDocument();
    expect(screen.getAllByText("me***@e***.test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Waiting for sign-up").length).toBeGreaterThan(0);
    expect(JSON.stringify({ ...localStorage })).not.toContain(email);
    if (useApi) expect(live.calls.some((c) => c.method === "POST" && c.path === "/api/workers")).toBe(true);
  });

  it("profile: an official's district change shows on their profile", async () => {
    await signInAs("official");
    await refreshGovProfile();
    await updateGovProfile({ district: "Roorkee" });
    renderAt("/official/profile");
    expect((await screen.findAllByText(/Roorkee/)).length).toBeGreaterThan(0);
    if (useApi) expect(live.calls.some((c) => c.method === "PATCH" && c.path === "/api/profile")).toBe(true);
  });

  it.runIf(useApi)("a photo that can't be stored: the complaint is filed and the citizen is told", async () => {
    await signInAs("citizen");
    live.blobDown(true);
    try {
      const complaint = await createComplaint({ ...GENERAL, photo: JPEG });
      expect(complaint.id).toMatch(/^SSB2026-/);
      expect(complaint.photoWarning).toBe("Photo could not be saved, your complaint was submitted without it.");
      render(
        <MemoryRouter initialEntries={[{ pathname: `/citizen/complaints/${complaint.id}`, state: { justSubmitted: true, photoWarning: complaint.photoWarning } }]}>
          <App />
        </MemoryRouter>
      );
      expect(await screen.findByText("Photo could not be saved, your complaint was submitted without it.")).toBeInTheDocument();
    } finally {
      live.blobDown(false);
    }
  });

  it("facility report: a citizen reports a toilet from its page; the same report again shows the open one", async () => {
    await signInAs("citizen");
    const toilet = DEMO_TOILETS[1];
    const user = userEvent.setup();
    const view = renderAt(`/citizen/toilet/${toilet.id}`);
    await user.click(await screen.findByRole("button", { name: "Report an issue" }));
    let sheet = await screen.findByRole("dialog", { name: "Report an issue" });
    expect(within(within(sheet).getByRole("group", { name: "Reporting" })).getByText(toilet.name)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("radio", { name: "Broken fixtures" }));
    await user.click(within(sheet).getByRole("button", { name: "Send report" }));
    expect(await screen.findByText(`Toilet ${toilet.id} · Broken fixtures`)).toBeInTheDocument();
    const firstPath = path();
    if (useApi) {
      const post = live.calls.find((c) => c.method === "POST" && c.path === "/api/complaints");
      expect(post).toBeTruthy();
    }
    view.unmount();

    renderAt(`/citizen/toilet/${toilet.id}?report=1`);
    sheet = await screen.findByRole("dialog", { name: "Report an issue" });
    await user.click(within(sheet).getByRole("radio", { name: "Broken fixtures" }));
    await user.click(within(sheet).getByRole("button", { name: "Send report" }));
    expect(await within(sheet).findByRole("heading", { name: "You already reported this" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Open your report" }));
    await waitFor(() => expect(path()).toBe(firstPath));
  });

  it.runIf(useApi)("facility report with a photo the store can't take: filed without it, with the same warning", async () => {
    await signInAs("citizen");
    live.blobDown(true);
    try {
      const { createFacilityComplaint } = await import("../services/complaintService");
      const t = DEMO_TOILETS[2];
      const complaint = await createFacilityComplaint({ facility: { ...t, type: "toilet" }, category: "No lighting", photo: JPEG });
      expect(complaint).toMatchObject({ facilityId: t.id, category: "No lighting", hasPhoto: false });
      expect(complaint.photoWarning).toBe("Photo could not be saved, your complaint was submitted without it.");
    } finally {
      live.blobDown(false);
    }
  });

  it.runIf(useApi)("photos: shown from the private store through the API, never from a public URL", async () => {
    const created = vi.fn(() => "blob:http://app.test/photo-1");
    vi.stubGlobal("URL", Object.assign(globalThis.URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    await signInAs("citizen");
    const complaint = await createComplaint({ ...GENERAL, photo: JPEG });
    renderAt(`/citizen/complaints/${complaint.id}`);
    const img = await screen.findByRole("img", { name: /reported issue/i });
    await waitFor(() => expect(img).toHaveAttribute("src", "blob:http://app.test/photo-1"));
    const call = live.calls.find((c) => c.path === `/api/complaints/${complaint.id}/photo`);
    expect(call.headers.Authorization).toMatch(/^Bearer /);
  });

  it.runIf(useApi)("loading and errors: a list that can't load says so and offers a retry", async () => {
    await signInAs("citizen");
    live.setOffline("/api/complaints");
    const user = userEvent.setup();
    renderAt("/citizen/complaints");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load your complaints/i);
    live.setOffline(null);
    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it.runIf(useApi)("a refused write rejects with the server's reason, and nothing changes", async () => {
    await signInAs("citizen");
    // Through the API the server records who filed it; the browser-only build takes it from the form.
    const complaint = await createComplaint(useApi ? GENERAL : { ...GENERAL, citizenId: "demo-citizen" });
    await signInAs("official");
    await act(() => refreshComplaints());
    await expect(assignComplaint(complaint.id, "w99", "Nobody")).rejects.toMatchObject({
      status: 400,
      message: "Please fix the highlighted fields.",
      fields: { workerId: "No active worker has that id." },
    });
    renderAt(`/official/complaints/${complaint.id}`);
    expect((await screen.findAllByText(/submitted/i)).length).toBeGreaterThan(0);
    expect(getComplaintById(complaint.id)).toMatchObject({ status: "SUBMITTED", assignedWorkerId: null });
    expect(path()).toBe(`/official/complaints/${complaint.id}`);
  });
});
