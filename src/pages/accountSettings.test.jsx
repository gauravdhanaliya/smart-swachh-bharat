// Feature 5: privacy settings — withdraw consent (data kept) vs delete my data
// (data removed: server first, then a fresh OTP and user.delete() on the device).

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));
vi.mock("../services/authService", async (importOriginal) => ({
  ...(await importOriginal()),
  sendDeleteOtp: vi.fn(async () => {}),
  confirmDeleteOtp: vi.fn(async () => {}),
  firebaseDeletionAvailable: vi.fn(async () => true),
  signOutUser: vi.fn(async () => {}),
}));
// The real deleteMyData, wrapped so one test can make the server step fail.
vi.mock("../services/consentService", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, deleteMyData: vi.fn((...args) => actual.deleteMyData(...args)) };
});

import App from "../App";
import { confirmDeleteOtp, sendDeleteOtp } from "../services/authService";
import { readSession, startOtpSession, startSession } from "../services/authSession";
import { clearConsentCache, deleteMyData } from "../services/consentService";
import { ApiError } from "../services/api";
import { createFacilityComplaint, getComplaints } from "../services/complaintService";
import { saveRating } from "../services/toiletRatingService";
import { LEGACY_BINS, LOCAL_API_KEY, TOILETS, seedLocalApi } from "../test/fixtures";
import { LOCAL_CONSENT_KEY, acceptConsentLocally } from "../test/consent";

const TOILET = { id: "PT-001", type: "toilet", name: "Main Gate Toilet", address: "Main Gate", latitude: 29.8884, longitude: 77.9589 };

function Path() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}
function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Path />
    </MemoryRouter>
  );
}
const path = () => screen.getByTestId("path").textContent;
const consents = () => JSON.parse(localStorage.getItem(LOCAL_CONSENT_KEY) ?? "{}");
const authError = (code) => Object.assign(new Error(code), { code });

async function phoneCitizenWithData() {
  const user = startOtpSession({ uid: "priv-user", phone: "9876543210" });
  acceptConsentLocally(user);
  await saveRating("PT-001", { stars: 2, comment: "Dirty floor" });
  await createFacilityComplaint({ facility: TOILET, category: "Dirty" });
  return user;
}

beforeEach(() => {
  seedLocalApi({ locations: [...LEGACY_BINS, ...TOILETS] });
  clearConsentCache();
  sendDeleteOtp.mockReset().mockResolvedValue();
  confirmDeleteOtp.mockReset().mockResolvedValue();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => vi.unstubAllGlobals());

describe("privacy settings in the profile", () => {
  it("explains withdraw (data kept) and delete (data removed) side by side", async () => {
    await phoneCitizenWithData();
    renderApp("/citizen/profile");
    const settings = await screen.findByRole("region", { name: "Privacy and data" });
    expect(within(settings).getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
    expect(within(settings).getByText(/signs you out.*your data is kept/i)).toBeInTheDocument();
    expect(within(settings).getByText(/permanently deletes/i)).toBeInTheDocument();
    expect(within(settings).getByRole("link", { name: "Withdraw consent" })).toHaveAttribute("href", "/account/withdraw");
    expect(within(settings).getByRole("link", { name: "Delete my data" })).toHaveAttribute("href", "/account/delete");
    expect(within(settings).queryByRole("button", { name: /reset demo consent/i })).toBeNull();
  });

  it("demo accounts can't delete, and get the presentation reset instead", async () => {
    acceptConsentLocally(startSession("citizen", ""));
    renderApp("/citizen/profile");
    const settings = await screen.findByRole("region", { name: "Privacy and data" });
    expect(within(settings).queryByRole("link", { name: "Delete my data" })).toBeNull();
    expect(within(settings).getByText(/demo accounts are shared.*can't be deleted/i)).toBeInTheDocument();
    expect(within(settings).getByRole("button", { name: /reset demo consent/i })).toBeInTheDocument();
  });

  it("officials and workers have the same privacy settings", async () => {
    acceptConsentLocally(startSession("official", ""));
    const view = renderApp("/official/profile");
    expect(await screen.findByRole("region", { name: "Privacy and data" })).toBeInTheDocument();
    view.unmount();
    acceptConsentLocally(startSession("worker", ""));
    renderApp("/worker/profile");
    expect(await screen.findByRole("region", { name: "Privacy and data" })).toBeInTheDocument();
  });

  it("Reset demo consent brings the consent screen back for the demo accounts", async () => {
    acceptConsentLocally(startSession("citizen", ""));
    renderApp("/citizen/profile");
    await userEvent.click(await screen.findByRole("button", { name: /reset demo consent/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Before you start" })).toBeInTheDocument();
    expect(consents()["demo-citizen"]).toBeUndefined();
  });
});

describe("withdraw consent", () => {
  it("says it is the withdraw screen and that data is kept; withdrawing signs out and keeps the data", async () => {
    await phoneCitizenWithData();
    renderApp("/account/withdraw");
    expect(await screen.findByRole("heading", { level: 1, name: "Withdraw consent" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/this screen withdraws your consent.*your data is kept/i);
    expect(screen.getByRole("link", { name: /delete my data instead/i })).toHaveAttribute("href", "/account/delete");

    await userEvent.click(screen.getByRole("button", { name: "Withdraw and sign out" }));
    await waitFor(() => expect(path()).toBe("/login"));
    expect(screen.getByRole("alert")).toHaveTextContent(/withdrew your consent.*data is kept/i);
    expect(readSession()).toBeNull();
    expect(consents()["priv-user"]).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(LOCAL_API_KEY)).ratings).toHaveLength(1);
    expect(getComplaints().filter((c) => c.citizenId === "priv-user")).toHaveLength(1);
  });
});

describe("delete my data", () => {
  it("says it is the delete screen, lists what is deleted and kept, and needs DELETE typed exactly", async () => {
    await phoneCitizenWithData();
    renderApp("/account/delete");
    expect(await screen.findByRole("heading", { level: 1, name: "Delete my data" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/this screen deletes your data.*can't be undone/i);
    expect(screen.getByRole("link", { name: /withdraw consent instead/i })).toHaveAttribute("href", "/account/withdraw");
    const deleted = screen.getByRole("list", { name: /will be deleted/i });
    expect(within(deleted).getByText(/your account/i)).toBeInTheDocument();
    expect(within(deleted).getByText(/firebase sign-in/i)).toBeInTheDocument();
    const kept = screen.getByRole("list", { name: /will be kept/i });
    expect(within(kept).getByText(/complaints you reported, anonymised/i)).toBeInTheDocument();

    const go = screen.getByRole("button", { name: "Delete my data" });
    expect(go).toBeDisabled();
    const confirm = screen.getByLabelText(/type delete to confirm/i);
    await userEvent.type(confirm, "delete");
    expect(go).toBeDisabled();
    await userEvent.clear(confirm);
    await userEvent.type(confirm, "DELETE");
    expect(go).toBeEnabled();
  });

  it("server data first, then a fresh OTP, then the Firebase sign-in is deleted", async () => {
    await phoneCitizenWithData();
    renderApp("/account/delete");
    await userEvent.type(await screen.findByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));

    // step 2: the app's data is already gone before any code is sent
    expect(await screen.findByRole("heading", { name: /verify your phone/i })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(LOCAL_API_KEY)).ratings).toHaveLength(0);
    expect(getComplaints().find((c) => c.facilityId === "PT-001")).toMatchObject({ citizenId: null, citizenName: "Deleted user" });
    expect(sendDeleteOtp).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/phone number/i), "9876543210");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(sendDeleteOtp).toHaveBeenCalledWith("9876543210");
    await userEvent.type(await screen.findByLabelText(/6-digit code/i), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirm and delete sign-in" }));
    expect(confirmDeleteOtp).toHaveBeenCalledWith("123456", { expectedUid: "priv-user" });

    expect(await screen.findByRole("heading", { name: /your data has been deleted/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(path()).toBe("/login"));
    expect(screen.getByRole("alert")).toHaveTextContent(/your data has been deleted/i);
    expect(readSession()).toBeNull();
  });

  it("if the server can't delete the data, the flow stops there: no code is asked for, and it can be retried", async () => {
    await phoneCitizenWithData();
    deleteMyData.mockRejectedValueOnce(new ApiError("Network problem. Check your internet connection and try again.", { status: 0 }));
    renderApp("/account/delete");
    await userEvent.type(await screen.findByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/network problem/i);
    expect(screen.queryByRole("heading", { name: /verify your phone/i })).toBeNull();
    expect(screen.queryByLabelText(/phone number/i)).toBeNull();
    expect(sendDeleteOtp).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(LOCAL_API_KEY)).ratings).toHaveLength(1);
    // try again: now it goes through
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    expect(await screen.findByRole("heading", { name: /verify your phone/i })).toBeInTheDocument();
  });

  it("auth/requires-recent-login: asks for a new code, and the retry deletes the sign-in", async () => {
    await phoneCitizenWithData();
    confirmDeleteOtp.mockRejectedValueOnce(authError("auth/requires-recent-login"));
    renderApp("/account/delete");
    await userEvent.type(await screen.findByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    await userEvent.type(await screen.findByLabelText(/phone number/i), "9876543210");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText(/6-digit code/i), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Confirm and delete sign-in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/firebase needs a fresh code/i);
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(sendDeleteOtp).toHaveBeenCalledTimes(2);
    await userEvent.type(await screen.findByLabelText(/6-digit code/i), "222222");
    await userEvent.click(screen.getByRole("button", { name: "Confirm and delete sign-in" }));
    expect(confirmDeleteOtp).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { name: /your data has been deleted/i })).toBeInTheDocument();
  });

  it("a different number: explained, and nothing is lost by trying again", async () => {
    await phoneCitizenWithData();
    confirmDeleteOtp.mockRejectedValueOnce(authError("auth/user-mismatch"));
    renderApp("/account/delete");
    await userEvent.type(await screen.findByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    await userEvent.type(await screen.findByLabelText(/phone number/i), "9876543211");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(await screen.findByLabelText(/6-digit code/i), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirm and delete sign-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't the one this account signed in with/i);
    expect(screen.getByRole("button", { name: "Send code" })).toBeInTheDocument();
  });

  it("demo accounts can't reach the flow", async () => {
    acceptConsentLocally(startSession("citizen", ""));
    renderApp("/account/delete");
    expect(await screen.findByText(/demo accounts are shared.*can't be deleted/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/type delete to confirm/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete my data" })).toBeNull();
  });

  it("signed out: sent to the login page", async () => {
    renderApp("/account/delete");
    expect(path()).toBe("/login");
  });
});
