import { describe, expect, it, vi } from "vitest";
import { PHOTO_MAX_DIMENSION, PHOTO_TARGET_BYTES, compressImage, dataUrlBytes } from "./imageCompression";

// A stand-in for the browser: "encoding" produces a data URL whose decoded
// size is width * height * quality / 4, so the algorithm has to shrink real
// numbers to get under the limit.
function fakeDeps({ width, height, fail = false }) {
  const encode = vi.fn((source, w, h, quality) => {
    const bytes = Math.round((w * h * quality) / 4);
    return `data:image/jpeg;base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;
  });
  const loadImage = vi.fn(async () => {
    if (fail) throw new Error("decode failed");
    return { source: "img", width, height };
  });
  return { loadImage, encode };
}

describe("dataUrlBytes", () => {
  it("reports the decoded size of a base64 data URL", () => {
    const bytes = Buffer.from("hello world!");
    expect(dataUrlBytes(`data:image/jpeg;base64,${bytes.toString("base64")}`)).toBe(12);
    expect(dataUrlBytes(`data:image/jpeg;base64,${Buffer.from("hi").toString("base64")}`)).toBe(2);
    expect(dataUrlBytes("")).toBe(0);
  });
});

describe("compressImage", () => {
  it("brings a large photo under the target size by scaling and lowering quality", async () => {
    const deps = fakeDeps({ width: 4000, height: 3000 });
    const out = await compressImage(new Blob(), {}, deps);
    expect(out.bytes).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
    expect(dataUrlBytes(out.dataUrl)).toBe(out.bytes);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(PHOTO_MAX_DIMENSION);
    expect(out.width / out.height).toBeCloseTo(4 / 3, 2);
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("keeps a small photo at its own size, re-encoded once at the best quality", async () => {
    const deps = fakeDeps({ width: 800, height: 600 });
    const out = await compressImage(new Blob(), {}, deps);
    expect([out.width, out.height]).toEqual([800, 600]);
    expect(deps.encode).toHaveBeenCalledTimes(1);
    expect(deps.encode.mock.calls[0][3]).toBe(0.85);
  });

  it("tries lower quality before halving the dimensions", async () => {
    const deps = fakeDeps({ width: 1600, height: 1600 });
    const out = await compressImage(new Blob(), { maxBytes: 400_000 }, deps);
    expect(out.bytes).toBeLessThanOrEqual(400_000);
    const sizes = deps.encode.mock.calls.map(([, w]) => w);
    const qualities = deps.encode.mock.calls.map(([, , , q]) => q);
    expect(sizes[0]).toBe(1600);
    expect(qualities[0]).toBeGreaterThan(qualities[1]);
    expect([out.width, out.height]).toEqual([1600, 1600]);
  });

  it("halves the dimensions when no quality is small enough", async () => {
    const deps = fakeDeps({ width: 1600, height: 1200 });
    const out = await compressImage(new Blob(), { maxBytes: 150_000 }, deps);
    expect(out.bytes).toBeLessThanOrEqual(150_000);
    expect(out.width).toBeLessThan(1600);
  });

  it("gives up with the smallest result rather than looping forever", async () => {
    const deps = fakeDeps({ width: 400, height: 400 });
    const out = await compressImage(new Blob(), { maxBytes: 1 }, deps);
    expect(out.bytes).toBeGreaterThan(1);
    expect(out.width).toBeGreaterThanOrEqual(100);
    expect(deps.encode.mock.calls.length).toBeLessThan(40);
  });

  it("fails with a readable error when the image can't be decoded", async () => {
    await expect(compressImage(new Blob(), {}, fakeDeps({ width: 10, height: 10, fail: true }))).rejects.toThrow(/couldn't read/i);
  });
});
