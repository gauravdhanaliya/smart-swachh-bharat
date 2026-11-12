import { describe, expect, it } from "vitest";
import { BIN_STATUS, BIN_STATUS_LABELS, migrateBinLocation, normalizeBinStatus } from "./bins";
import { nextBinStatus } from "../hooks/useLiveBins";
import { computeBinStats } from "../utils/govStats";
import { binToPayload, locationToBin } from "../services/locationAdapters";
import { api } from "../services/api";
import { startSession } from "../services/authSession";
import { LEGACY_BINS, seedLocalApi, storedLocalApi } from "../test/fixtures";

describe("normalizeBinStatus", () => {
  it("keeps a valid status, whatever the old percentage said", () => {
    expect(normalizeBinStatus({ status: "normal", details: { fillLevel: 99 } })).toBe(BIN_STATUS.NORMAL);
    expect(normalizeBinStatus({ status: "overflow", details: { fillLevel: 3 } })).toBe(BIN_STATUS.OVERFLOW);
    expect(normalizeBinStatus({ status: "almost_full" })).toBe(BIN_STATUS.ALMOST_FULL);
  });

  it("derives a status for an old record that only has a percentage", () => {
    expect(normalizeBinStatus({ details: { fillLevel: 95 } })).toBe(BIN_STATUS.OVERFLOW);
    expect(normalizeBinStatus({ details: { fillLevel: 91 } })).toBe(BIN_STATUS.OVERFLOW);
    expect(normalizeBinStatus({ details: { fillLevel: 90 } })).toBe(BIN_STATUS.ALMOST_FULL);
    expect(normalizeBinStatus({ details: { fillLevel: 71 } })).toBe(BIN_STATUS.ALMOST_FULL);
    expect(normalizeBinStatus({ details: { fillLevel: 70 } })).toBe(BIN_STATUS.NORMAL);
    expect(normalizeBinStatus({ details: { fillLevel: 0 } })).toBe(BIN_STATUS.NORMAL);
  });

  it("falls back to normal for anything it can't read", () => {
    for (const record of [{}, null, undefined, { status: "FULL" }, { status: 80 }, { details: { fillLevel: "lots" } }, { details: null }]) {
      expect(normalizeBinStatus(record)).toBe(BIN_STATUS.NORMAL);
    }
  });

  it("has a label for every status", () => {
    expect(BIN_STATUS_LABELS).toEqual({ normal: "Normal", almost_full: "Almost Full", overflow: "Overflow" });
  });
});

describe("migrateBinLocation", () => {
  it("drops the percentage and its history and keeps everything else", () => {
    const migrated = migrateBinLocation(LEGACY_BINS[0]);
    expect(migrated.details).toEqual({ wasteType: "Dry Waste" });
    expect(migrated.status).toBe("normal");
    expect(migrated).toMatchObject({ id: "DB-001", name: "Library Bin", latitude: 29.8908 });
  });

  it("gives a status to a record that never had one", () => {
    expect(migrateBinLocation(LEGACY_BINS[1])).toMatchObject({ status: "overflow", details: { wasteType: "Wet Waste" } });
  });

  it("returns an already clean bin unchanged (same object)", () => {
    const clean = { id: "DB-9", type: "dustbin", status: "normal", details: { wasteType: "Dry Waste" } };
    expect(migrateBinLocation(clean)).toBe(clean);
  });

  it("leaves toilets and buildings alone", () => {
    const toilet = { id: "PT-1", type: "public_toilet", status: "Open", details: { cleanliness: 4, fillLevel: 5 } };
    expect(migrateBinLocation(toilet)).toBe(toilet);
  });

  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(LEGACY_BINS[1]));
    migrateBinLocation(LEGACY_BINS[1]);
    expect(LEGACY_BINS[1]).toEqual(copy);
  });
});

describe("stored data from an older build", () => {
  it("is migrated when the local API loads it, and saved back clean", async () => {
    seedLocalApi();
    const { locations } = await api("/locations");
    const bins = locations.filter((l) => l.type === "dustbin");
    expect(bins.map((b) => [b.id, b.status])).toEqual([
      ["DB-001", "normal"],
      ["DB-002", "overflow"],
      ["DB-003", "almost_full"],
    ]);
    for (const bin of bins) {
      expect(bin.details).not.toHaveProperty("fillLevel");
      expect(bin.details).not.toHaveProperty("history");
    }
    expect(JSON.stringify(storedLocalApi())).not.toMatch(/fillLevel|history/);
  });

  it("does not crash on a bin with no details at all", async () => {
    seedLocalApi({ locations: [{ ...LEGACY_BINS[0], details: undefined, status: undefined }] });
    const { locations } = await api("/locations");
    expect(locations[0].status).toBe("normal");
    expect(locationToBin(locations[0])).toMatchObject({ id: "DB-001", status: "normal", type: "Mixed Waste" });
  });
});

describe("local API bin writes", () => {
  it("creates a bin with the chosen status and stores no percentage", async () => {
    seedLocalApi({ locations: [] });
    startSession("official", "");
    const { location } = await api("/locations", {
      method: "POST",
      body: { name: "Gate Bin", type: "dustbin", latitude: 29.89, longitude: 77.96, address: "Gate", status: "almost_full", details: { wasteType: "Dry Waste", fillLevel: 12 } },
    });
    expect(location.status).toBe("almost_full");
    expect(location.details).toEqual({ wasteType: "Dry Waste" });
  });

  it("defaults a new bin to normal and rejects an unknown status", async () => {
    seedLocalApi({ locations: [] });
    startSession("official", "");
    const body = { name: "Gate Bin", type: "dustbin", latitude: 29.89, longitude: 77.96, address: "Gate" };
    expect((await api("/locations", { method: "POST", body })).location.status).toBe("normal");
    await expect(api("/locations", { method: "POST", body: { ...body, status: "half" } })).rejects.toMatchObject({ status: 400 });
  });
});

describe("locationAdapters", () => {
  it("maps a bin without any percentage fields", () => {
    const bin = locationToBin({ ...LEGACY_BINS[2], updatedAt: new Date().toISOString() });
    expect(bin).toMatchObject({ id: "DB-003", status: "almost_full", type: "Mixed Waste", category: "bin" });
    expect(bin).not.toHaveProperty("fillLevel");
    expect(bin).not.toHaveProperty("history");
  });

  it("derives the status for an unmigrated record", () => {
    expect(locationToBin(LEGACY_BINS[1]).status).toBe("overflow");
  });

  it("sends the status, not a percentage, when saving a bin", () => {
    const payload = binToPayload({ name: "N", address: "A", latitude: 1, longitude: 2, type: "Wet Waste", status: "overflow", description: "", fillLevel: 30 });
    expect(payload.status).toBe("overflow");
    expect(payload.details).toEqual({ wasteType: "Wet Waste" });
  });

  it("leaves the status out of the payload when none was chosen", () => {
    expect(binToPayload({ name: "N", address: "A", latitude: 1, longitude: 2, type: "Wet Waste" })).not.toHaveProperty("status");
  });
});

describe("status based logic", () => {
  it("counts bins by status for the dashboards", () => {
    const bins = [{ status: "normal" }, { status: "overflow" }, { status: "overflow" }, { status: "almost_full" }];
    expect(computeBinStats(bins)).toEqual({ total: 4, overflowing: 2, almostFull: 1, normal: 1 });
  });

  it("simulated live data moves a bin one status step at a time", () => {
    expect(nextBinStatus("normal", 0)).toBe("almost_full");
    expect(nextBinStatus("almost_full", 0)).toBe("overflow");
    // An overflowing bin gets "collected" and goes back to normal.
    expect(nextBinStatus("overflow", 0)).toBe("normal");
  });

  it("simulated live data usually leaves a bin as it is", () => {
    for (const status of ["normal", "almost_full", "overflow"]) {
      expect(nextBinStatus(status, 0.5)).toBe(status);
      expect(nextBinStatus(status, 0.99)).toBe(status);
    }
  });

  it("simulated live data never produces an unknown status", () => {
    // An unreadable status is treated as normal, then follows the usual steps.
    expect(nextBinStatus("garbage", 0.9)).toBe("normal");
    expect(nextBinStatus(undefined, 0.9)).toBe("normal");
    expect(nextBinStatus(87, 0)).toBe("almost_full");
  });
});
