import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  splitLocations,
  locationToBin,
  locationToToilet,
  relativeTime,
  binToPayload,
  toiletToPayload,
  BUILDING_TYPES,
} from "../src/services/locationAdapters.js";

const NOW = Date.parse("2026-06-01T12:00:00Z");

const base = {
  description: "",
  address: "Near Block A, COER University",
  createdBy: "system",
  createdAt: "2026-06-01T11:58:00Z",
  updatedAt: "2026-06-01T11:58:00Z",
  requestId: null,
};

const LOCATIONS = [
  { ...base, id: "DB-001", name: "Bin", type: "dustbin", latitude: 29.8905551, longitude: 77.9601633, status: "almost_full", details: { wasteType: "Dry Waste", fillLevel: 78 }, source: "demo", isDemo: true },
  { ...base, id: "PT-001", name: "Toilet", type: "public_toilet", latitude: 29.8906, longitude: 77.9602, status: "Open", details: { openingHours: "24 Hours", cleanliness: 5, facilities: ["Men"] }, source: "government", isDemo: false },
  { ...base, id: "BL-001", name: "Library", type: "library", latitude: 29.8907, longitude: 77.9603, status: "Open", details: {}, source: "demo", isDemo: true },
  { ...base, id: "BL-002", name: "Main Gate", type: "main_gate", latitude: 29.8884, longitude: 77.9589, status: "Open", details: {}, source: "government", isDemo: false },
  { ...base, id: "CP-001", name: "Campus", type: "campus", latitude: 29.8905429, longitude: 77.9594553, status: "Open", details: {}, source: "verified", isDemo: false },
];

describe("splitLocations", () => {
  const { bins, toilets, buildings } = splitLocations(LOCATIONS, NOW);

  test("routes each type to the right list", () => {
    assert.deepEqual(bins.map((b) => b.id), ["DB-001"]);
    assert.deepEqual(toilets.map((t) => t.id), ["PT-001"]);
    assert.deepEqual(buildings.map((b) => b.id), ["BL-001", "BL-002", "CP-001"]);
  });

  test("keeps the saved coordinates exactly", () => {
    assert.equal(bins[0].latitude, 29.8905551);
    assert.equal(bins[0].longitude, 77.9601633);
  });

  test("bins expose fill level, waste type and status", () => {
    assert.equal(bins[0].fillLevel, 78);
    assert.equal(bins[0].type, "Dry Waste");
    assert.equal(bins[0].status, "almost_full");
    assert.equal(bins[0].history.length, 6);
  });

  test("demo data stays flagged DEMO and is labelled as simulated", () => {
    assert.equal(bins[0].isDemo, true);
    assert.equal(bins[0].source, "DEMO");
    assert.match(bins[0].locationLabel, /DEMO/);
    assert.equal(toilets[0].isDemo, false);
    assert.equal(toilets[0].source, "GOVERNMENT");
  });

  test("buildings carry a label and icon, and the campus reference is verified", () => {
    const lib = buildings.find((b) => b.id === "BL-001");
    assert.equal(lib.typeLabel, "Library");
    assert.ok(lib.icon);
    const campus = buildings.find((b) => b.id === "CP-001");
    assert.equal(campus.isDemo, false);
    assert.match(campus.locationLabel, /Verified/);
  });

  test("unknown types are ignored rather than crashing", () => {
    const out = splitLocations([{ ...LOCATIONS[0], type: "spaceship" }], NOW);
    assert.equal(out.bins.length + out.toilets.length + out.buildings.length, 0);
  });
});

describe("single-record mapping", () => {
  test("missing details fall back to safe defaults", () => {
    const bin = locationToBin({ ...LOCATIONS[0], details: {} }, NOW);
    assert.equal(bin.fillLevel, 0);
    assert.equal(bin.type, "Mixed Waste");
    const toilet = locationToToilet({ ...LOCATIONS[1], details: {} }, NOW);
    assert.deepEqual(toilet.facilities, ["Men", "Women"]);
    assert.equal(toilet.distance, "");
  });
});

describe("relativeTime", () => {
  test("formats recent and older timestamps", () => {
    assert.equal(relativeTime("2026-06-01T11:59:50Z", NOW), "Just now");
    assert.equal(relativeTime("2026-06-01T11:58:00Z", NOW), "2 mins ago");
    assert.equal(relativeTime("2026-06-01T09:00:00Z", NOW), "3 hrs ago");
    assert.equal(relativeTime("garbage", NOW), "");
  });
});

describe("form → API payloads", () => {
  test("bin payload", () => {
    const p = binToPayload({ name: "N", address: "A", latitude: 1, longitude: 2, type: "Wet Waste", fillLevel: 30, description: "" });
    assert.equal(p.type, "dustbin");
    assert.deepEqual(p.details, { wasteType: "Wet Waste", fillLevel: 30 });
  });

  test("toilet payload only sends a status when one is given", () => {
    const a = toiletToPayload({ name: "N", address: "A", latitude: 1, longitude: 2, openingHours: "24 Hours", facilities: ["Men"] });
    assert.equal("status" in a, false);
    const b = toiletToPayload({ name: "N", address: "A", latitude: 1, longitude: 2, openingHours: "24 Hours", facilities: ["Men"], status: "Closed" });
    assert.equal(b.status, "Closed");
  });

  test("building types exclude the campus reference", () => {
    assert.ok(!BUILDING_TYPES.includes("campus"));
    assert.ok(BUILDING_TYPES.includes("hostel"));
  });
});
