// WCAG AA contrast for the colour tokens in src/index.css, and a scan that
// keeps low-contrast disabled styles from creeping back in.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const css = readFileSync(join(SRC, "index.css"), "utf8");

function token(name) {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`--color-${name} is not defined in index.css`);
  return m[1];
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("disabled controls", () => {
  it("keep AA contrast (4.5:1) on their grey surface and on white", () => {
    const ink = token("disabled-ink");
    expect(contrast(ink, token("disabled-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("still look disabled: a grey surface, not a brand colour", () => {
    const surface = token("disabled-surface");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(surface.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(16); // close to neutral
    expect(luminance(surface)).toBeGreaterThan(0.7); // light, so it reads as "off"
  });

  it("no button fades its label below AA (no opacity or pale fills when disabled)", () => {
    const files = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(jsx?|tsx?)$/.test(f) && !/\.test\./.test(f)) files.push(p);
      }
    };
    walk(SRC);
    const banned = /disabled:(opacity-\d+|bg-(?:emerald|orange|sky|red|green|amber)-[1-3]00\b|text-(?:slate|gray|emerald|orange|sky)-\d+(?:\/\d+)?)/g;
    const found = files.flatMap((p) => [...readFileSync(p, "utf8").matchAll(banned)].map((m) => `${p.slice(SRC.length + 1)}: ${m[0]}`));
    expect(found).toEqual([]);
  });
});

describe("login backdrop", () => {
  it("brand text stays AA over every backdrop colour at full strength", () => {
    const backgrounds = ["backdrop-green", "backdrop-sky", "backdrop-amber"].map(token);
    for (const text of ["brand-green-700", "brand-green-800"].map(token)) {
      for (const bg of backgrounds) expect(contrast(text, bg), `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
