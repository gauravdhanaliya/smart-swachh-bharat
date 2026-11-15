import { describe, expect, it } from "vitest";
import { displayFacilityName } from "./facilityName";

describe("displayFacilityName", () => {
  it("takes ' (DEMO)' out of the name and asks for the badge instead", () => {
    expect(displayFacilityName({ name: "Main Gate Public Toilet (DEMO)", isDemo: true })).toEqual({ name: "Main Gate Public Toilet", demo: true });
    expect(displayFacilityName({ name: "Hostel Block Toilet (demo) " })).toEqual({ name: "Hostel Block Toilet", demo: true });
  });

  it("leaves a real facility alone", () => {
    expect(displayFacilityName({ name: "Ward 9 Toilet", isDemo: false })).toEqual({ name: "Ward 9 Toilet", demo: false });
  });
});
