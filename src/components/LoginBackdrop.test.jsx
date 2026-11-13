// The login page's ambient background: decoration only, cheap, and still
// for people who ask for reduced motion. (That it never moves the content,
// and really is still under reduced motion in a browser, is checked by
// npm run test:layout.)
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let reduced = false;
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal()),
  useReducedMotion: () => reduced,
}));

import LoginBackdrop from "./LoginBackdrop";
import { BLOBS } from "./loginBackdropBlobs";

afterEach(() => {
  reduced = false;
});

describe("LoginBackdrop", () => {
  it("is hidden from assistive tech, can't be clicked, and sits behind the page", () => {
    const { container } = render(<LoginBackdrop />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toMatch(/\bpointer-events-none\b/);
    expect(root.className).toMatch(/\babsolute\b/);
    expect(root.className).toMatch(/\binset-0\b/);
    expect(root.className.split(/\s+/)).toContain("-z-10");
    expect(root.className).toMatch(/\boverflow-hidden\b/);
  });

  it("drifts slowly when motion is allowed", () => {
    const { container } = render(<LoginBackdrop />);
    expect(container.firstElementChild).toHaveAttribute("data-motion", "ambient");
    for (const blob of BLOBS) expect(blob.duration).toBeGreaterThanOrEqual(15); // slow, not attention-grabbing
  });

  it("is completely still with prefers-reduced-motion", () => {
    reduced = true;
    const { container } = render(<LoginBackdrop />);
    expect(container.firstElementChild).toHaveAttribute("data-motion", "static");
  });

  it("animates only transforms and opacity (no layout, no filters)", () => {
    for (const blob of BLOBS) {
      expect(Object.keys(blob.animate).every((k) => ["x", "y", "scale", "rotate", "opacity"].includes(k))).toBe(true);
    }
  });

  it("uses only the backdrop colour tokens checked for AA text contrast", () => {
    for (const blob of BLOBS) expect(blob.color).toMatch(/^var\(--color-backdrop-(green|sky|amber)\)$/);
  });
});
