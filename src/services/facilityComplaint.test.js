// Feature 4: complaints about a specific bin or toilet, in the browser-only
// build (the API's rules are tested in server/test/complaints.test.js; the
// same calls through the API run in pages/apiMode.test.jsx).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startOtpSession, startSession } from "./authSession";
import { createFacilityComplaint, getComplaintById, getOpenComplaintCount, updateComplaintStatus } from "./complaintService";
import { FACILITY_CATEGORIES, PHOTO_NOT_SAVED } from "../../server/src/constants.js";

const TOILET = { id: "PT-001", type: "toilet", name: "Main Gate Toilet", address: "Main Gate, COER University", latitude: 29.8884, longitude: 77.9589 };
const BIN = { id: "DB-001", type: "bin", name: "Library Bin", address: "Central Library", latitude: 29.8908, longitude: 77.9606 };
const JPEG = `data:image/jpeg;base64,${btoa("jpeg bytes")}`;

beforeEach(() => {
  startOtpSession({ uid: "reporter-1", phone: "9876543210" });
});
afterEach(() => vi.restoreAllMocks());

describe("creating a facility complaint", () => {
  it("links the complaint to the facility, with the location taken from it", async () => {
    const c = await createFacilityComplaint({ facility: TOILET, category: "No water", description: "  Taps dry since morning " });
    expect(c).toMatchObject({
      facilityType: "toilet",
      facilityId: "PT-001",
      category: "No water",
      issueType: "Public Toilet Issue",
      priority: FACILITY_CATEGORIES.toilet["No water"],
      description: "Taps dry since morning",
      location: { address: TOILET.address, latitude: TOILET.latitude, longitude: TOILET.longitude },
      status: "SUBMITTED",
    });
    expect(getComplaintById(c.id)).toMatchObject({ facilityId: "PT-001", citizenId: "reporter-1" });
  });

  it("categories depend on the facility type", async () => {
    await expect(createFacilityComplaint({ facility: BIN, category: "Overflowing" })).resolves.toMatchObject({ issueType: "Bin Issue" });
    await expect(createFacilityComplaint({ facility: BIN, category: "Dirty" })).rejects.toMatchObject({ status: 400, fields: { category: expect.any(String) } });
    await expect(createFacilityComplaint({ facility: TOILET, category: "Overflowing" })).rejects.toMatchObject({ fields: { category: expect.any(String) } });
  });

  it('"Other" needs a description; descriptions are at most 500 characters', async () => {
    await expect(createFacilityComplaint({ facility: TOILET, category: "Other" })).rejects.toMatchObject({ fields: { description: expect.any(String) } });
    await expect(createFacilityComplaint({ facility: TOILET, category: "Dirty", description: "x".repeat(501) })).rejects.toMatchObject({
      fields: { description: expect.any(String) },
    });
    await expect(createFacilityComplaint({ facility: TOILET, category: "Other", description: "Door hinge broken" })).resolves.toBeTruthy();
  });

  it("the same report while the first is still open is refused with the open one's id", async () => {
    const first = await createFacilityComplaint({ facility: TOILET, category: "Dirty" });
    const again = createFacilityComplaint({ facility: TOILET, category: "Dirty" });
    await expect(again).rejects.toMatchObject({ status: 409, existingId: first.id });
    // another category, or another citizen, is a new report
    await expect(createFacilityComplaint({ facility: TOILET, category: "No lighting" })).resolves.toBeTruthy();
    startOtpSession({ uid: "reporter-2", phone: "9876543211" });
    await expect(createFacilityComplaint({ facility: TOILET, category: "Dirty" })).resolves.toBeTruthy();
  });

  it("once the first report is resolved, the same report can be made again", async () => {
    const first = await createFacilityComplaint({ facility: BIN, category: "Damaged" });
    updateComplaintStatus(first.id, "RESOLVED", { resolutionNote: "Fixed" });
    await expect(createFacilityComplaint({ facility: BIN, category: "Damaged" })).resolves.toBeTruthy();
  });

  it("only citizens can report", async () => {
    startSession("worker", "");
    await expect(createFacilityComplaint({ facility: BIN, category: "Damaged" })).rejects.toMatchObject({ status: 403 });
  });

  it("if the photo can't be stored, the complaint is still filed without it, with the same warning as the API", async () => {
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      if (String(value).includes("data:image")) throw new DOMException("full", "QuotaExceededError");
      return real.call(this, key, value);
    });
    const c = await createFacilityComplaint({ facility: TOILET, category: "Dirty", photo: JPEG });
    expect(c.photoWarning).toBe(PHOTO_NOT_SAVED);
    expect(getComplaintById(c.id)).toMatchObject({ facilityId: "PT-001", photo: null });
  });
});

describe("open complaint count for a facility", () => {
  it("counts reports that aren't resolved yet", async () => {
    expect(await getOpenComplaintCount("PT-001")).toBe(0);
    const a = await createFacilityComplaint({ facility: TOILET, category: "Dirty" });
    await createFacilityComplaint({ facility: TOILET, category: "No water" });
    await createFacilityComplaint({ facility: BIN, category: "Damaged" });
    expect(await getOpenComplaintCount("PT-001")).toBe(2);
    updateComplaintStatus(a.id, "RESOLVED", { resolutionNote: "Cleaned" });
    expect(await getOpenComplaintCount("PT-001")).toBe(1);
  });
});
