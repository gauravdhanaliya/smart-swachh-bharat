// A worker's map looks at their own area: tasks first, else the city in
// their area text, else the default city. Never a hard-coded Lucknow.
import { describe, expect, it } from "vitest";
import { cityForArea, workerMapFrame } from "./workerArea";
import { CITIES, DEFAULT_CITY_ID } from "../data/cities";

const fallback = CITIES.find((c) => c.id === DEFAULT_CITY_ID);

describe("cityForArea", () => {
  it("finds the city named in the area", () => {
    expect(cityForArea("Roorkee City & Railway Station").name).toBe("Roorkee");
    expect(cityForArea("roorkee civil lines").name).toBe("Roorkee");
  });

  it("matches whole words only", () => {
    expect(cityForArea("Roorkeeville").id).toBe(fallback.id);
  });

  it("falls back to the default city for empty or unknown areas", () => {
    expect(cityForArea("").id).toBe(fallback.id);
    expect(cityForArea(undefined).id).toBe(fallback.id);
    expect(cityForArea("Nowhere Ward 9").id).toBe(fallback.id);
  });
});

describe("workerMapFrame", () => {
  it("fits the worker's located tasks and centres on their area's city", () => {
    const tasks = [
      { location: { latitude: 29.87, longitude: 77.89 } },
      { location: { latitude: Number.NaN, longitude: 77.9 } },
      { location: null },
    ];
    const frame = workerMapFrame({ area: "Roorkee City & Railway Station" }, tasks);
    expect(frame.points).toEqual([{ latitude: 29.87, longitude: 77.89 }]);
    expect(frame.cityName).toBe("Roorkee");
    expect(Math.abs(frame.center.latitude - 29.87)).toBeLessThan(0.2);
  });

  it("with no tasks, has no points and still a centre", () => {
    const frame = workerMapFrame({ area: "Roorkee" }, []);
    expect(frame.points).toEqual([]);
    expect(Number.isFinite(frame.center.latitude)).toBe(true);
  });
});
