import { describe, expect, it } from "vitest";
import { simulateTick } from "./useLiveBins";
import { locationToBin } from "../services/locationAdapters";
import { api } from "../services/api";
import { startSession } from "../services/authSession";
import { LEGACY_BINS, seedLocalApi } from "../test/fixtures";

const always = () => 0; // every roll says "change"

describe("simulateTick", () => {
  it("moves simulated bins and leaves manually set bins alone", () => {
    const bins = [
      { id: "a", status: "normal", statusSource: "simulated" },
      { id: "b", status: "normal", statusSource: "manual" },
      { id: "c", status: "almost_full" }, // older record without the flag
    ];
    const next = simulateTick(bins, always);
    expect(next.map((b) => b.status)).toEqual(["almost_full", "normal", "overflow"]);
    expect(next[1]).toBe(bins[1]);
  });

  it("returns the same objects when nothing changes", () => {
    const bins = [{ id: "a", status: "normal", statusSource: "simulated" }];
    expect(simulateTick(bins, () => 0.9)[0]).toBe(bins[0]);
  });
});

describe("statusSource", () => {
  it("is carried from the API record to the screen shape, defaulting to simulated", () => {
    expect(locationToBin({ ...LEGACY_BINS[2], statusSource: "manual" }).statusSource).toBe("manual");
    expect(locationToBin(LEGACY_BINS[2]).statusSource).toBe("simulated");
  });

  it("is set to manual when an official sends a status, and kept otherwise", async () => {
    seedLocalApi({ locations: [] });
    startSession("official", "");
    const body = { name: "Gate Bin", type: "dustbin", latitude: 29.89, longitude: 77.96, address: "Gate" };
    const auto = (await api("/locations", { method: "POST", body })).location;
    expect(auto.statusSource).toBe("simulated");

    const manual = (await api("/locations", { method: "POST", body: { ...body, status: "overflow" } })).location;
    expect(manual.statusSource).toBe("manual");

    const renamed = (await api(`/locations/${manual.id}`, { method: "PATCH", body: { name: "Gate Bin 2" } })).location;
    expect(renamed.statusSource).toBe("manual");
    expect(renamed.status).toBe("overflow");

    const set = (await api(`/locations/${auto.id}`, { method: "PATCH", body: { status: "almost_full" } })).location;
    expect(set.statusSource).toBe("manual");
  });

  it("is not added to toilets", async () => {
    seedLocalApi({ locations: [] });
    startSession("official", "");
    const toilet = (await api("/locations", { method: "POST", body: { name: "T", type: "public_toilet", latitude: 29.89, longitude: 77.96, address: "x", status: "Open" } })).location;
    expect(toilet).not.toHaveProperty("statusSource");
  });
});
