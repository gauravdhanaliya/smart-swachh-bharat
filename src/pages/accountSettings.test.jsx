// Feature 5: privacy settings — withdraw consent (data kept) vs delete my data
// (data removed: the account confirms its password first, then the server
// data, then user.delete() of the Firebase account on the device).

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));
vi.mock("../services/authService", async (importOriginal) => ({
  ...(await importOriginal()),
  verifyPassword: vi.fn(async () => {}),
  deleteFirebaseAccount: vi.fn(async () => ({ deleted: true })),
  logIn: vi.fn(),
  signOutUser: vi.fn(async () => {}),
}));
// The real deleteMyData, wrapped so one test can make the server step fail.
vi.mock("../services/consentService", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, deleteMyData: vi.fn((...args) => actual.deleteMyData(...args)) };
});

import App from "../App";
import { deleteFirebaseAccount, logIn, signOutUser, verifyPassword } from "../services/authService";
import { readSession, startEmailSession, startSession } from "../services/authSession";
import { clearConsentCache, deleteMyData } from "../services/consentService";
import { ApiError } from "../services/api";
import { createFacilityComplaint, getComplaints } from "../services/complaintService";
import { saveRating } from "../services/toiletRatingService";
import { LEGACY_BINS, LOCAL_API_KEY, TOILETS, seedLocalApi } from "../test/fixtures";
import { LOCAL_CONSENT_KEY, acceptConsentLocally } from "../test/consent";
import { agreeToConsent } from "../test/loginPage";

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

async function citizenWithData() {
  const user = startEmailSession({ uid: "priv-user", email: "asha@example.test", emailVerified: true });
  acceptConsentLocally(user);
  await saveRating("PT-001", { stars: 2, comment: "Dirty floor" });
  await createFacilityComplaint({ facility: TOILET, category: "Dirty" });
  return user;
}

beforeEach(() => {
  seedLocalApi({ locations: [...LEGACY_BINS, ...TOILETS] });
  clearConsentCache();
  verifyPassword.mockReset().mockResolvedValue();
  deleteFirebaseAccount.mockReset().mockResolvedValue({ deleted: true });
  deleteMyData.mockClear();
  signOutUser.mockClear();
  logIn.mockReset();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => vi.unstubAllGlobals());

describe("privacy settings in the profile", () => {
  it("explains withdraw (data kept) and delete (data removed) side by side", async () => {
    await citizenWithData();
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
    await citizenWithData();
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

describe("withdraw consent keeps the account, so the user can come back", () => {
  it("logging in again (after agreeing again) brings the same account and its complaints back", async () => {
    await citizenWithData();
    renderApp("/account/withdraw");
    await userEvent.click(await screen.findByRole("button", { name: "Withdraw and sign out" }));
    await waitFor(() => expect(path()).toBe("/login"));
    logIn.mockResolvedValue({ uid: "priv-user", idToken: "t", email: "asha@example.test", emailVerified: true });
    const user = userEvent.setup();
    // asked again, on the start screen, before anything is sent
    await agreeToConsent(user);
    await user.type(await screen.findByLabelText(/^email$/i), "asha@example.test");
    await user.type(screen.getByLabelText(/^password$/i), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));
    await waitFor(() => expect(readSession()?.id).toBe("priv-user"));
    expect(consents()["priv-user"]).toMatchObject({ items: { readNotice: true } }); // the new agreement, recorded
    expect(getComplaints().filter((c) => c.citizenId === "priv-user")).toHaveLength(1);
  });
});

describe("delete my data", () => {
  it("says it is the delete screen, lists what is deleted and kept, and needs DELETE typed exactly", async () => {
    await citizenWithData();
    renderApp("/account/delete");
    expect(await screen.findByRole("heading", { level: 1, name: "Delete my data" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/this screen deletes your data.*can't be undone/i);
    expect(screen.getByRole("link", { name: /withdraw consent instead/i })).toHaveAttribute("href", "/account/withdraw");
    const deleted = screen.getByRole("list", { name: /will be deleted/i });
    expect(within(deleted).getByText(/your account/i)).toBeInTheDocument();
    expect(within(deleted).getByText(/firebase sign-in account/i)).toBeInTheDocument();
    const kept = screen.getByRole("list", { name: /will be kept/i });
    expect(within(kept).getByText(/complaints you reported, anonymised/i)).toBeInTheDocument();

    const go = screen.getByRole("button", { name: "Delete my data" });
    expect(go).toBeDisabled();
    const confirm = screen.getByLabelText(/type delete to confirm/i);
    await userEvent.type(confirm, "delete");
    expect(go).toBeDisabled();
    await userEvent.clear(confirm);
    await userEvent.type(confirm, "DELETE");
    expect(go).toBeDisabled(); // and the password
    await userEvent.type(screen.getByLabelText(/your password/i), "s3cret-pass");
    expect(go).toBeEnabled();
  });

  it("server data first, then the Firebase account; then signed out with a notice", async () => {
    await citizenWithData();
    renderApp("/account/delete");
    await userEvent.type(await screen.findByLabelText(/your password/i), "s3cret-pass");
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    deleteFirebaseAccount.mockImplementation(async () => {
      // by now the app's data is already gone
      expect(JSON.parse(localStorage.getItem(LOCAL_API_KEY)).ratings).toHaveLength(0);
      return { deleted: true };
    });
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));

    expect(await screen.findByRole("heading", { name: /your data has been deleted/i })).toBeInTheDocument();
    expect(deleteFirebaseAccount).toHaveBeenCalledWith({ expectedUid: "priv-user" });
    expect(getComplaints().find((c) => c.facilityId === "PT-001")).toMatchObject({ citizenId: null, citizenName: "Deleted user" });
    expect(screen.getByText(/sign-in account has been removed/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(path()).toBe("/login"));
    expect(screen.getByRole("alert")).toHaveTextContent(/your data has been deleted/i);
    expect(readSession()).toBeNull();
  });

  it("with no sign-in account on this device to remove, the user is told", async () => {
    await citizenWithData();
    deleteFirebaseAccount.mockResolvedValue({ deleted: false });
    renderApp("/account/delete");
    await userEvent.type(await screen.findByLabelText(/your password/i), "s3cret-pass");
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    expect(await screen.findByText(/no sign-in account on this device to remove/i)).toBeInTheDocument();
  });

  it("the password is checked FIRST, before anything is deleted", async () => {
    await citizenWithData();
    const order = [];
    verifyPassword.mockImplementation(async () => order.push("password"));
    deleteMyData.mockImplementationOnce(async (...args) => {
      order.push("server");
      const { deleteMyData: real } = await vi.importActual("../services/consentService");
      return real(...args);
    });
    deleteFirebaseAccount.mockImplementation(async () => {
      order.push("firebase");
      return { deleted: true };
    });
    renderApp("/account/delete");
    const go = await screen.findByRole("button", { name: "Delete my data" });
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    expect(go).toBeDisabled(); // the password is required too
    const password = screen.getByLabelText(/your password/i);
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    await userEvent.type(password, "s3cret-pass");
    await userEvent.click(go);
    expect(await screen.findByRole("heading", { name: /your data has been deleted/i })).toBeInTheDocument();
    expect(verifyPassword).toHaveBeenCalledWith("s3cret-pass");
    expect(order).toEqual(["password", "server", "firebase"]);
  });

  it("a wrong password stops before anything is deleted", async () => {
    await citizenWithData();
    verifyPassword.mockRejectedValue(authError("auth/invalid-credential"));
    renderApp("/account/delete");
    await userEvent.type(await screen.findByLabelText(/your password/i), "wrong-one");
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/email or password is wrong/i);
    expect(deleteMyData).not.toHaveBeenCalled();
    expect(deleteFirebaseAccount).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(LOCAL_API_KEY)).ratings).toHaveLength(1);
    expect(readSession()).toMatchObject({ id: "priv-user" });
  });

  it("if the server can't delete the data, the flow stops there: Firebase isn't touched, and it can be retried", async () => {
    await citizenWithData();
    deleteMyData.mockRejectedValueOnce(new ApiError("Network problem. Check your internet connection and try again.", { status: 0 }));
    renderApp("/account/delete");
    await userEvent.type(await screen.findByLabelText(/your password/i), "s3cret-pass");
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/network problem/i);
    expect(deleteFirebaseAccount).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(LOCAL_API_KEY)).ratings).toHaveLength(1);
    // try again: now it goes through
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    expect(await screen.findByRole("heading", { name: /your data has been deleted/i })).toBeInTheDocument();
  });

  it("if the Firebase account can't be removed afterwards, the data is still deleted and that is said plainly", async () => {
    await citizenWithData();
    deleteFirebaseAccount.mockRejectedValue(authError("auth/network-request-failed"));
    renderApp("/account/delete");
    await userEvent.type(await screen.findByLabelText(/your password/i), "s3cret-pass");
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    expect(await screen.findByRole("heading", { name: /your data has been deleted/i })).toBeInTheDocument();
    expect(screen.getByText(/couldn't be removed from this device.*holds no ecosetu data/i)).toBeInTheDocument();
  });

  it("demo accounts can't reach the flow", async () => {
    acceptConsentLocally(startSession("citizen", ""));
    renderApp("/account/delete");
    expect(await screen.findByText(/demo accounts are shared.*can't be deleted/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/type delete to confirm/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete my data" })).toBeNull();
  });

  it("signed out: sent to the start screen", async () => {
    renderApp("/account/delete");
    expect(path()).toBe("/login");
  });
});
