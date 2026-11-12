import { describe, expect, it } from "vitest";
import { backdrop, fadeUp, sheet, step } from "./motion";

const moves = (preset) => JSON.stringify(preset).match(/"(x|y|scale)"/g) ?? [];

describe("motion presets", () => {
  it("normally move a little as well as fade", () => {
    expect(moves(fadeUp(false)).length).toBeGreaterThan(0);
    expect(moves(sheet(false)).length).toBeGreaterThan(0);
    expect(moves(step(false, 1)).length).toBeGreaterThan(0);
  });

  it("with prefers-reduced-motion: fade only, nothing moves or scales", () => {
    for (const preset of [fadeUp(true), sheet(true), step(true, 1), step(true, -1), backdrop(true)]) {
      expect(moves(preset)).toEqual([]);
    }
  });

  it("exits are quicker than entrances", () => {
    for (const reduced of [false, true]) {
      const p = fadeUp(reduced);
      expect(p.exit.transition.duration).toBeLessThan(p.animate.transition.duration ?? 1);
    }
  });

  it("steps slide in the direction of travel", () => {
    expect(step(false, 1).initial.x).toBeGreaterThan(0);
    expect(step(false, -1).initial.x).toBeLessThan(0);
  });
});
