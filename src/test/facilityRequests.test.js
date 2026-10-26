import { describe, expect, it } from "vitest";
import {
  createFacilityRequest,
  getFacilityRequestById,
  getFacilityRequests,
  getFacilityRequestsForWorker,
  updateFacilityRequestStatus,
} from "../services/facilityRequestService";
import { addGovernmentFacility, getAllBins, getAllBuildings, getAllToilets } from "../services/facilityService";
import { refreshFresh } from "../services/locationStore";
import { startSession } from "../services/authSession";
import { FACILITY_TYPE, REQUEST_STATUS } from "../data/facilityRequests";

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
  startSession(role);
  await refreshFresh();
}

describe("facility store", () => {
  it("starts empty: no buildings, bins or toilets", async () => {
    await asRole("citizen");
    expect(getAllBuildings()).toEqual([]);
    expect(getAllBins()).toEqual([]);
    expect(getAllToilets()).toEqual([]);
  });

  it("an official's new bin and toilet appear in the shared store", async () => {
    await asRole("official");
    await addGovernmentFacility({ facilityType: FACILITY_TYPE.DUSTBIN, name: "Gate bin", address: "Main gate", latitude: 29.888, longitude: 77.958, type: "Dry Waste", fillLevel: 80 });
    await addGovernmentFacility({ facilityType: FACILITY_TYPE.TOILET, name: "Gate toilet", address: "Main gate", latitude: 29.888, longitude: 77.958, openingHours: "24 hours", facilities: ["Men", "Women"] });

    await asRole("citizen");
    expect(getAllBins()).toEqual([expect.objectContaining({ name: "Gate bin", fillLevel: 80, status: "almost_full", category: "bin" })]);
    expect(getAllToilets()).toEqual([expect.objectContaining({ name: "Gate toilet", category: "toilet" })]);
  });

  it("clearing storage brings back the seed data", async () => {
    await asRole("official");
    await addGovernmentFacility({ facilityType: FACILITY_TYPE.DUSTBIN, name: "Temp bin", address: "x", latitude: 29.89, longitude: 77.96 });
    localStorage.clear();
    await asRole("official");
    expect(getAllBins()).toEqual([]);
  });

  it("a citizen cannot add facilities", async () => {
    await asRole("citizen");
    await expect(
      addGovernmentFacility({ facilityType: FACILITY_TYPE.DUSTBIN, name: "x", address: "x", latitude: 29.89, longitude: 77.96 })
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("facility request lifecycle", () => {
  it("starts with no requests, and request ids follow the current year", async () => {
    await asRole("worker");
    expect(getFacilityRequestsForWorker("w1")).toEqual([]);
    const created = await createFacilityRequest(request());
    expect(created.id).toBe(`FR-${new Date().getFullYear()}-001`);
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
    expect(getAllBins()).toEqual([]);

    const approved = await updateFacilityRequestStatus(created.id, REQUEST_STATUS.APPROVED);
    expect(approved).toMatchObject({ status: REQUEST_STATUS.APPROVED, reviewedBy: "Demo Official" });

    for (const role of ["citizen", "worker", "official"]) {
      await asRole(role);
      expect(getAllBins()).toEqual([
        expect.objectContaining({ name: "Dustbin by the canteen", requestId: created.id, source: "WORKER_APPROVED" }),
      ]);
    }
  });

  it("approving a toilet request publishes a toilet", async () => {
    await asRole("worker");
    const created = await createFacilityRequest(request({ facilityType: FACILITY_TYPE.TOILET, suggestedName: "Toilet by hostel" }));
    await asRole("official");
    await updateFacilityRequestStatus(created.id, REQUEST_STATUS.APPROVED);
    expect(getAllToilets()).toEqual([expect.objectContaining({ name: "Toilet by hostel" })]);
    expect(getAllBins()).toEqual([]);
  });

  it("reject needs a reason, stores it, and publishes nothing", async () => {
    await asRole("worker");
    const created = await createFacilityRequest(request());
    await asRole("official");
    await expect(updateFacilityRequestStatus(created.id, REQUEST_STATUS.REJECTED)).rejects.toMatchObject({ status: 400 });
    const rejected = await updateFacilityRequestStatus(created.id, REQUEST_STATUS.REJECTED, { rejectionReason: "Bin already nearby" });
    expect(rejected).toMatchObject({ status: REQUEST_STATUS.REJECTED, rejectionReason: "Bin already nearby" });
    expect(getAllBins()).toEqual([]);
  });

  it("a decided request can't be decided again", async () => {
    await asRole("worker");
    const created = await createFacilityRequest(request());
    await asRole("official");
    await updateFacilityRequestStatus(created.id, REQUEST_STATUS.APPROVED);
    await expect(updateFacilityRequestStatus(created.id, REQUEST_STATUS.REJECTED, { rejectionReason: "late" })).rejects.toMatchObject({ status: 409 });
    expect(getAllBins()).toHaveLength(1);
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
