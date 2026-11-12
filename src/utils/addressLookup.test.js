import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOVE_LOOKUP_M, SETTLED_ACCURACY_M, STILL_MS, createAddressLookup, distanceMeters } from "./addressLookup";

const BASE = { lat: 29.8645, lng: 77.8964 };
// About `m` metres north of BASE.
const north = (m) => ({ lat: BASE.lat + m / 111_320, lng: BASE.lng });

let lookups;
let ctl;
beforeEach(() => {
  vi.useFakeTimers();
  lookups = [];
  ctl = createAddressLookup({ lookup: (lat, lng) => lookups.push([lat, lng]) });
});
afterEach(() => {
  ctl.stop();
  vi.useRealTimers();
});

describe("address lookup for the complaint pin", () => {
  it("10 GPS updates in 2 seconds make exactly one request, after the position settles", () => {
    for (let i = 0; i < 10; i++) {
      const p = north(i * 3); // creeping a few metres, accuracy never under 50 m
      ctl.fix(p.lat, p.lng, 120 - i * 5);
      vi.advanceTimersByTime(200);
    }
    expect(lookups).toHaveLength(0); // still moving: not settled yet
    vi.advanceTimersByTime(STILL_MS);
    expect(lookups).toHaveLength(1);
    const last = north(27);
    expect(lookups[0]).toEqual([last.lat, last.lng]); // the latest position
    vi.advanceTimersByTime(10_000);
    expect(lookups).toHaveLength(1);
  });

  it("settles at once when accuracy is under 50 m, and later updates make no more requests", () => {
    ctl.fix(BASE.lat, BASE.lng, 300);
    ctl.fix(BASE.lat, BASE.lng, SETTLED_ACCURACY_M - 1);
    expect(lookups).toHaveLength(1);
    for (let i = 1; i <= 8; i++) ctl.fix(north(i).lat, north(i).lng, 20);
    vi.advanceTimersByTime(10_000);
    expect(lookups).toHaveLength(1);
  });

  it("settles after 3 seconds without moving, even if accuracy stays poor", () => {
    ctl.fix(BASE.lat, BASE.lng, 900);
    vi.advanceTimersByTime(STILL_MS - 1);
    expect(lookups).toHaveLength(0);
    ctl.fix(BASE.lat + 0.000001, BASE.lng, 800); // jitter under a few metres is "not moving"
    vi.advanceTimersByTime(1);
    expect(lookups).toHaveLength(1);
  });

  it("moving the pin more than 25 m looks the address up again; less does not", () => {
    ctl.fix(BASE.lat, BASE.lng, 10);
    expect(lookups).toHaveLength(1);
    ctl.movePin(north(MOVE_LOOKUP_M - 5).lat, BASE.lng);
    expect(lookups).toHaveLength(1);
    ctl.movePin(north(MOVE_LOOKUP_M + 5).lat, BASE.lng);
    expect(lookups).toHaveLength(2);
    // measured from where the address was last looked up
    ctl.movePin(north(MOVE_LOOKUP_M + 15).lat, BASE.lng);
    expect(lookups).toHaveLength(2);
  });

  it("a pin moved before GPS settled is looked up once, at its new place", () => {
    ctl.fix(BASE.lat, BASE.lng, 400);
    ctl.movePin(north(100).lat, BASE.lng);
    expect(lookups).toEqual([[north(100).lat, BASE.lng]]);
    vi.advanceTimersByTime(STILL_MS * 2);
    ctl.fix(BASE.lat, BASE.lng, 10); // GPS no longer moves a pin the user placed
    expect(lookups).toHaveLength(1);
  });

  it("stop() cancels a pending lookup", () => {
    ctl.fix(BASE.lat, BASE.lng, 400);
    ctl.stop();
    vi.advanceTimersByTime(STILL_MS * 2);
    expect(lookups).toHaveLength(0);
  });

  it("distanceMeters", () => {
    expect(distanceMeters(BASE.lat, BASE.lng, north(100).lat, BASE.lng)).toBeCloseTo(100, 0);
    expect(distanceMeters(BASE.lat, BASE.lng, BASE.lat, BASE.lng)).toBe(0);
  });
});
