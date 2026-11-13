// The shared facility store and the facility-request lifecycle in the
// browser-only build (ported from main's 7cef7da facilityRequests.test,
// rewritten for the seeded demo data and status-only bins).
import { describe, expect, it, vi } from "vitest";
import { LOCAL_API_KEY } from "../test/fixtures";
import {
  createFacilityRequest,
  getFacilityRequestById,
  getFacilityRequests,
  getFacilityRequestsForWorker,
  updateFacilityRequestStatus,
} from "./facilityRequestService";
import { addGovernmentFacility, getAllBins, getAllBuildings, getAllToilets } from "./facilityService";
import { refreshFresh } from "./locationStore";
import { startSession } from "./authSession";
import { FACILITY_TYPE, REQUEST_STATUS } from "../data/facilityRequests";
import { DEMO_BINS, DEMO_BUILDINGS, DEMO_REQUESTS, DEMO_TOILETS } from "../../server/src/seed-data.js";

const request = (overrides = {}) => ({
  facilityType: FACILITY_TYPE.DUSTBIN,
  suggestedName: "Dustbin by the canteen",
  location: { address: "Canteen, COER", latitude: 29.8904, longitude: 77.9614 },
  reason: "Waste piles up after lunch",
  description: "",
  priority: "HIGH",
  requestedByWorkerId: "w1",
  requestedByWorkerName: "Vikash Kumar",
  ...overrides,
});

async function asRole(role) {
  startSession(role, "");
  await refreshFresh();
}

const names = (list) => list.map((x) => x.name);

describe("facility store", () => {
  it("starts with the seeded demo buildings, bins and toilets", async () => {
    await asRole("citizen");
    expect(getAllBins().length).toBeGreaterThanOrEqual(DEMO_BINS.length);
    expect(getAllToilets().length).toBeGreaterThanOrEqual(DEMO_TOILETS.length);
    expect(getAllBuildings().length).toBeGreaterThanOrEqual(DEMO_BUILDINGS.length);
    expect(names(getAllBins()).some((n) => n.startsWith("Main Gate Dustbin"))).toBe(true);
  });

  it("an official's new bin and toilet appear for every role, the bin with a status and no percentage", async () => {
    await asRole("official");
    await addGovernmentFacility({ facilityType: FACILITY_TYPE.DUSTBIN, name: "Gate bin", address: "Main gate", latitude: 29.888, longitude: 77.958, type: "Dry Waste", status: "almost_full" });
    await addGovernmentFacility({ facilityType: FACILITY_TYPE.TOILET, name: "Gate toilet", address: "Main gate", latitude: 29.888, longitude: 77.958, openingHours: "24 hours", facilities: ["Men", "Women"] });

    for (const role of ["citizen", "worker", "official"]) {
      await asRole(role);
      const bin = getAllBins().find((b) => b.name === "Gate bin");
      expect(bin).toMatchObject({ status: "almost_full", category: "bin" });
      expect(bin.fillLevel).toBeUndefined();
      expect(getAllToilets().find((t) => t.name === "Gate toilet")).toMatchObject({ category: "toilet" });
    }
  });

  it("clearing storage brings back the seed data (and drops what was added)", async () => {
    await asRole("official");
    await addGovernmentFacility({ facilityType: FACILITY_TYPE.DUSTBIN, name: "Temp bin", address: "x", latitude: 29.89, longitude: 77.96, status: "normal" });
    expect(names(getAllBins())).toContain("Temp bin");
    localStorage.clear();
    await asRole("official");
    expect(names(getAllBins())).not.toContain("Temp bin");
    expect(names(getAllBins()).some((n) => n.startsWith("Main Gate Dustbin"))).toBe(true);
  });

  it("if storage becomes unreadable, the tab keeps what it last saw", async () => {
    await asRole("official");
    await addGovernmentFacility({ facilityType: FACILITY_TYPE.DUSTBIN, name: "Kept bin", address: "x", latitude: 29.89, longitude: 77.96, status: "normal" });
    const realGetItem = Storage.prototype.getItem;
    const blocked = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (key) {
      if (key === LOCAL_API_KEY) throw new DOMException("blocked", "SecurityError");
      return realGetItem.call(this, key);
    });
    await refreshFresh();
    expect(names(getAllBins())).toContain("Kept bin");
    blocked.mockRestore();
  });

  it("a citizen cannot add facilities", async () => {
    await asRole("citizen");
    await expect(
      addGovernmentFacility({ facilityType: FACILITY_TYPE.DUSTBIN, name: "x", address: "x", latitude: 29.89, longitude: 77.96, status: "normal" })
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("facility request lifecycle", () => {
  it("starts with the seeded demo requests; a new one gets the next FR id", async () => {
    await asRole("worker");
    const seededIds = DEMO_REQUESTS.map((r) => r.id);
    expect(getFacilityRequests().map((r) => r.id)).toEqual(expect.arrayContaining(seededIds));
    const created = await createFacilityRequest(request());
    expect(created.id).toMatch(/^FR-\d{4}-\d{3,}$/);
    expect(seededIds).not.toContain(created.id);
  });

  it("in 2027 a new request gets an FR-2027- id numbered from 001; the 2026 ones keep theirs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2027-03-01T10:00:00+05:30"));
      await asRole("worker");
      const a = await createFacilityRequest(request());
      const b = await createFacilityRequest(request({ suggestedName: "Second bin" }));
      expect([a.id, b.id]).toEqual(["FR-2027-001", "FR-2027-002"]);
      expect(getFacilityRequests().map((r) => r.id)).toEqual(expect.arrayContaining(DEMO_REQUESTS.map((r) => r.id)));
    } finally {
      vi.useRealTimers();
    }
  });

  it("create → under review → approve publishes the facility for every role", async () => {
    await asRole("worker");
    const created = await createFacilityRequest(request());
    expect(created).toMatchObject({ status: REQUEST_STATUS.PENDING, requestedByWorkerId: "w1" });
    expect(getFacilityRequestsForWorker("w1").some((r) => r.id === created.id)).toBe(true);

    await asRole("official");
    expect(getFacilityRequestById(created.id)).toMatchObject({ status: REQUEST_STATUS.PENDING });
    const reviewing = await updateFacilityRequestStatus(created.id, REQUEST_STATUS.UNDER_REVIEW);
    expect(reviewing.status).toBe(REQUEST_STATUS.UNDER_REVIEW);
    expect(names(getAllBins())).not.toContain("Dustbin by the canteen");

    const approved = await updateFacilityRequestStatus(created.id, REQUEST_STATUS.APPROVED);
    expect(approved).toMatchObject({ status: REQUEST_STATUS.APPROVED, reviewedBy: "Demo Official" });

    for (const role of ["citizen", "worker", "official"]) {
      await asRole(role);
      expect(getAllBins()).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Dustbin by the canteen", requestId: created.id, source: "WORKER_APPROVED" })])
      );
    }
  });

  it("approving a toilet request publishes a toilet, not a bin", async () => {
    await asRole("worker");
    const created = await createFacilityRequest(request({ facilityType: FACILITY_TYPE.TOILET, suggestedName: "Toilet by hostel" }));
    await asRole("official");
    await updateFacilityRequestStatus(created.id, REQUEST_STATUS.APPROVED);
    expect(names(getAllToilets())).toContain("Toilet by hostel");
    expect(names(getAllBins())).not.toContain("Toilet by hostel");
  });

  it("reject needs a reason, stores it, and publishes nothing", async () => {
    await asRole("worker");
    const created = await createFacilityRequest(request());
    await asRole("official");
    await expect(updateFacilityRequestStatus(created.id, REQUEST_STATUS.REJECTED)).rejects.toMatchObject({ status: 400 });
    const rejected = await updateFacilityRequestStatus(created.id, REQUEST_STATUS.REJECTED, { rejectionReason: "Bin already nearby" });
    expect(rejected).toMatchObject({ status: REQUEST_STATUS.REJECTED, rejectionReason: "Bin already nearby" });
    expect(names(getAllBins())).not.toContain("Dustbin by the canteen");
  });

  it("a decided request can't be decided again", async () => {
    await asRole("worker");
    const created = await createFacilityRequest(request());
    await asRole("official");
    await updateFacilityRequestStatus(created.id, REQUEST_STATUS.APPROVED);
    const before = getAllBins().length;
    await expect(updateFacilityRequestStatus(created.id, REQUEST_STATUS.REJECTED, { rejectionReason: "late" })).rejects.toMatchObject({ status: 409 });
    expect(getAllBins()).toHaveLength(before);
    expect(getAllBins().filter((b) => b.requestId === created.id)).toHaveLength(1);
  });

  it("only an official can approve, and a citizen can't see requests", async () => {
    await asRole("worker");
    const created = await createFacilityRequest(request());
    await expect(updateFacilityRequestStatus(created.id, REQUEST_STATUS.APPROVED)).rejects.toMatchObject({ status: 403 });
    await asRole("citizen");
    expect(getFacilityRequests()).toEqual([]);
  });

  it("invalid requests come back with field errors", async () => {
    await asRole("worker");
    await expect(createFacilityRequest(request({ suggestedName: "", reason: "x" }))).rejects.toMatchObject({
      status: 400,
      fields: expect.objectContaining({ suggestedName: expect.any(String), reason: expect.any(String) }),
    });
  });
});
