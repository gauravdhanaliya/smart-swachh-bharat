// Ported from main's 7cef7da freshStart.test ("city list").
import { describe, expect, it } from "vitest";
import RAW from "./indiaLocations.json";
import { CITIES } from "./indiaLocations";

describe("city list", () => {
  it("has no duplicate cities (the census list repeats a few)", () => {
    const keys = CITIES.map((c) => `${c.name}|${c.state}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("drops only exact repeats, keeping the first of each", () => {
    const dropped = RAW.cities.filter((c) => !CITIES.includes(c)).map((c) => c.id);
    expect(dropped.sort()).toEqual(["alappuzha-kl-2", "amreli-gj-2"]);
    expect(CITIES.map((c) => c.id)).toEqual(expect.arrayContaining(["alappuzha-kl", "amreli-gj"]));
  });

  it("city ids stay unique", () => {
    const ids = CITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
