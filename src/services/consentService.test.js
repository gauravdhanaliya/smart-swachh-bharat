// Consent and "delete my data" in the browser-only build (the API's rules are
// tested in server/test/privacy.test.js and demo-login.test.js).

import { beforeEach, describe, expect, it } from "vitest";
import { startOtpSession, startSession } from "./authSession";
import { acceptConsent, deleteMyData, getConsentStatus, resetDemoConsent, withdrawConsent } from "./consentService";
import { createFacilityComplaint, getComplaints } from "./complaintService";
import { saveRating } from "./toiletRatingService";
import { DEFAULT_CONSENT_VERSION } from "../../server/src/constants.js";
import { LEGACY_BINS, LOCAL_API_KEY, TOILETS, seedLocalApi } from "../test/fixtures";
import { LOCAL_CONSENT_KEY } from "../test/consent";

const ALL = { phoneForLogin: true, locationWhenReporting: true, photosAttached: true, readNotice: true };
const otp = (uid) => startOtpSession({ uid, phone: "9876543210" });
const TOILET = { id: "PT-001", type: "toilet", name: "Main Gate Toilet", address: "Main Gate", latitude: 29.8884, longitude: 77.9589 };

beforeEach(() => seedLocalApi({ locations: [...LEGACY_BINS, ...TOILETS] }));

describe("consent", () => {
  it("nobody has accepted at first; accepting the current version makes it up to date", async () => {
    otp("c1");
    expect(await getConsentStatus()).toMatchObject({ version: DEFAULT_CONSENT_VERSION, consent: null, upToDate: false });
    const state = await acceptConsent(DEFAULT_CONSENT_VERSION, ALL);
    expect(state.upToDate).toBe(true);
    expect(state.consent).toMatchObject({ version: DEFAULT_CONSENT_VERSION, items: ALL, acceptedAt: expect.any(String) });
  });

  it("consent is kept per account", async () => {
    otp("c1");
    await acceptConsent(DEFAULT_CONSENT_VERSION, ALL);
    otp("c2");
    expect((await getConsentStatus()).upToDate).toBe(false);
  });

  it("required boxes: notice, location, photos — and the phone box for phone-login users only", async () => {
    otp("c1");
    await expect(acceptConsent(DEFAULT_CONSENT_VERSION, { ...ALL, phoneForLogin: false })).rejects.toMatchObject({
      status: 400,
      fields: { phoneForLogin: expect.any(String) },
    });
    for (const key of ["readNotice", "locationWhenReporting", "photosAttached"]) {
      await expect(acceptConsent(DEFAULT_CONSENT_VERSION, { ...ALL, [key]: false })).rejects.toMatchObject({ fields: { [key]: expect.any(String) } });
    }
    startSession("citizen", "");
    await expect(acceptConsent(DEFAULT_CONSENT_VERSION, { ...ALL, phoneForLogin: false })).resolves.toMatchObject({ upToDate: true });
  });

  it("an old notice version is refused, and an old acceptance counts as not up to date", async () => {
    otp("c1");
    await expect(acceptConsent(DEFAULT_CONSENT_VERSION - 1, ALL)).rejects.toMatchObject({ status: 409 });
    localStorage.setItem(LOCAL_CONSENT_KEY, JSON.stringify({ c1: { version: DEFAULT_CONSENT_VERSION - 1, acceptedAt: "2026-01-01T00:00:00Z", items: ALL } }));
    expect((await getConsentStatus()).upToDate).toBe(false);
  });

  it("withdrawing removes the consent but keeps the user's data", async () => {
    otp("c1");
    await acceptConsent(DEFAULT_CONSENT_VERSION, ALL);
    await saveRating("PT-001", { stars: 4 });
    await createFacilityComplaint({ facility: TOILET, category: "Dirty" });
    await withdrawConsent();
    expect((await getConsentStatus()).upToDate).toBe(false);
    expect(JSON.parse(localStorage.getItem(LOCAL_API_KEY)).ratings).toHaveLength(1);
    expect(getComplaints().filter((c) => c.citizenId === "c1")).toHaveLength(1);
  });
});

describe("reset demo consent", () => {
  it("a demo account clears every demo account's consent, and no one else's", async () => {
    otp("real-1");
    await acceptConsent(DEFAULT_CONSENT_VERSION, ALL);
    for (const role of ["citizen", "official"]) {
      startSession(role, "");
      await acceptConsent(DEFAULT_CONSENT_VERSION, { ...ALL, phoneForLogin: false });
    }
    expect(await resetDemoConsent()).toEqual({ reset: 2 });
    expect((await getConsentStatus()).upToDate).toBe(false);
    otp("real-1");
    expect((await getConsentStatus()).upToDate).toBe(true);
  });

  it("phone-login accounts can't use it", async () => {
    otp("real-1");
    await expect(resetDemoConsent()).rejects.toMatchObject({ status: 403 });
  });
});

describe("delete my data", () => {
  it("removes only this user's records; complaints stay, anonymised", async () => {
    otp("erase-me");
    await acceptConsent(DEFAULT_CONSENT_VERSION, ALL);
    await saveRating("PT-001", { stars: 2, comment: "Smelly" });
    const mine = await createFacilityComplaint({ facility: TOILET, category: "Dirty" });
    localStorage.setItem("ssb_citizen_prefs_v1", JSON.stringify({ sms: true }));
    localStorage.setItem("ssb_citizen_notifications_seen_v1", "2026-11-01T00:00:00Z");
    sessionStorage.setItem("ssb_geo_cache_v1", "[]");

    otp("bystander");
    await acceptConsent(DEFAULT_CONSENT_VERSION, ALL);
    await saveRating("PT-001", { stars: 5 });
    const theirs = await createFacilityComplaint({ facility: TOILET, category: "No water" });

    otp("erase-me");
    await expect(deleteMyData()).resolves.toMatchObject({ anonymised: { complaints: 1 } });

    const db = JSON.parse(localStorage.getItem(LOCAL_API_KEY));
    expect(db.ratings.map((r) => r.userId)).toEqual(["bystander"]);
    expect(Object.keys(JSON.parse(localStorage.getItem(LOCAL_CONSENT_KEY)))).toEqual(["bystander"]);
    const kept = getComplaints().find((c) => c.id === mine.id);
    expect(kept).toMatchObject({ citizenId: null, citizenName: "Deleted user", photo: null, category: "Dirty" });
    expect(getComplaints().find((c) => c.id === theirs.id)).toMatchObject({ citizenId: "bystander" });
    // nothing else mentions the user (the sign-in itself ends when the flow finishes)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== "ssb_auth_session_v1") expect(localStorage.getItem(key), key).not.toContain("erase-me");
    }
    // what only this device remembered for the citizen goes too
    expect(localStorage.getItem("ssb_citizen_prefs_v1")).toBeNull();
    expect(localStorage.getItem("ssb_citizen_notifications_seen_v1")).toBeNull();
    expect(sessionStorage.getItem("ssb_geo_cache_v1")).toBeNull();
    // shared data stays
    expect(db.locations.length).toBeGreaterThan(0);
  });

  it("the shared demo accounts can't be deleted", async () => {
    startSession("citizen", "");
    await expect(deleteMyData()).rejects.toMatchObject({ status: 403 });
  });
});
