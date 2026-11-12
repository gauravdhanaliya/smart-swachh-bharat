import { describe, expect, it } from "vitest";
import { RATING_LABELS, formatAverage, isLowRated, ratingCountLabel, summarizeRatings } from "./ratings";

describe("summarizeRatings", () => {
  it("no ratings: no average, count 0", () => {
    expect(summarizeRatings([])).toEqual({ average: null, count: 0, categories: {} });
  });

  it("averages the stars to one decimal", () => {
    expect(summarizeRatings([{ stars: 4 }, { stars: 5 }, { stars: 4 }])).toMatchObject({ average: 4.3, count: 3 });
    expect(summarizeRatings([{ stars: 1 }, { stars: 2 }])).toMatchObject({ average: 1.5, count: 2 });
  });

  it("averages each category over only the people who scored it", () => {
    const s = summarizeRatings([
      { stars: 5, categories: { cleanliness: 5, water: 2 } },
      { stars: 3, categories: { cleanliness: 4 } },
      { stars: 4 },
    ]);
    expect(s.categories).toEqual({ cleanliness: { average: 4.5, count: 2 }, water: { average: 2, count: 1 } });
  });
});

describe("helpers", () => {
  it("low rated means an average below 3 from at least 3 ratings", () => {
    expect(isLowRated({ average: 2.9, count: 3 })).toBe(true);
    expect(isLowRated({ average: 3, count: 10 })).toBe(false);
    expect(isLowRated({ average: 1, count: 2 })).toBe(false);
    expect(isLowRated(null)).toBe(false);
    expect(isLowRated({ average: null, count: 0 })).toBe(false);
  });

  it("formats averages with one decimal, and counts in words", () => {
    expect(formatAverage(4)).toBe("4.0");
    expect(formatAverage(3.25)).toBe("3.3");
    expect(formatAverage(null)).toBe("–");
    expect(ratingCountLabel(0)).toBe("No ratings yet");
    expect(ratingCountLabel(1)).toBe("1 rating");
    expect(ratingCountLabel(12)).toBe("12 ratings");
  });

  it("has a label for every category the API accepts", async () => {
    const { RATING_CATEGORIES } = await import("../../server/src/constants.js");
    expect(Object.keys(RATING_LABELS).sort()).toEqual([...RATING_CATEGORIES].sort());
  });
});
