// The rating service against the browser-only API (same paths, shapes and
// validation as the EcoSetu API; the API itself is tested in server/test).

import { beforeEach, describe, expect, it } from "vitest";
import { startOtpSession, startSession } from "./authSession";
import { LEGACY_BINS, TOILETS, seedLocalApi, storedLocalApi } from "../test/fixtures";
import {
  getLowRatedToilets,
  getMyRating,
  getRatingSummaries,
  getRatingSummary,
  listRatings,
  saveRating,
} from "./toiletRatingService";

const T = "PT-001";
const asCitizen = (uid) => startOtpSession({ uid, phone: "9876543210" });

beforeEach(() => {
  seedLocalApi({ locations: [...LEGACY_BINS, ...TOILETS, { ...TOILETS[0], id: "PT-002", name: "Library Toilet" }] });
});

describe("saving a rating", () => {
  it("a citizen rates a toilet; the summary has the average and count", async () => {
    asCitizen("u1");
    const { rating, summary } = await saveRating(T, { stars: 4, categories: { cleanliness: 5 }, comment: "  Clean  " });
    expect(rating).toMatchObject({ stars: 4, comment: "Clean", categories: { cleanliness: 5 } });
    expect(summary).toMatchObject({ toiletId: T, average: 4, count: 1, categories: { cleanliness: { average: 5, count: 1 } } });
  });

  it("rating again updates the same rating instead of adding one", async () => {
    asCitizen("u1");
    await saveRating(T, { stars: 5, comment: "Great" });
    const { summary } = await saveRating(T, { stars: 2 });
    expect(summary).toMatchObject({ average: 2, count: 1 });
    expect(storedLocalApi().ratings.filter((r) => r.toiletId === T)).toHaveLength(1);
    expect(await getMyRating(T)).toMatchObject({ stars: 2, comment: "" });
  });

  it("each citizen has their own rating", async () => {
    asCitizen("u1");
    await saveRating(T, { stars: 5 });
    asCitizen("u2");
    expect(await getMyRating(T)).toBeNull();
    const { summary } = await saveRating(T, { stars: 2 });
    expect(summary).toMatchObject({ average: 3.5, count: 2 });
  });

  it("validation: whole stars 1 to 5, categories 1 to 5, comment up to 300 (empty allowed)", async () => {
    asCitizen("u1");
    for (const stars of [0, 6, 2.5, "4", undefined]) {
      await expect(saveRating(T, { stars })).rejects.toMatchObject({ status: 400, fields: { stars: expect.any(String) } });
    }
    await expect(saveRating(T, { stars: 3, categories: { cleanliness: 9 } })).rejects.toMatchObject({ fields: { categories: expect.any(String) } });
    await expect(saveRating(T, { stars: 3, categories: { smell: 2 } })).rejects.toMatchObject({ fields: { categories: expect.any(String) } });
    await expect(saveRating(T, { stars: 3, comment: "x".repeat(301) })).rejects.toMatchObject({ fields: { comment: expect.any(String) } });
    await expect(saveRating(T, { stars: 3, comment: "" })).resolves.toMatchObject({ rating: { comment: "" } });
    await expect(saveRating(T, { stars: 3, comment: "x".repeat(300) })).resolves.toBeTruthy();
  });

  it("only citizens can rate, and only toilets that exist", async () => {
    startSession("worker", "");
    await expect(saveRating(T, { stars: 4 })).rejects.toMatchObject({ status: 403 });
    startSession("official", "");
    await expect(saveRating(T, { stars: 4 })).rejects.toMatchObject({ status: 403 });
    asCitizen("u1");
    await expect(saveRating("PT-999", { stars: 4 })).rejects.toMatchObject({ status: 404 });
    await expect(saveRating("DB-001", { stars: 4 })).rejects.toMatchObject({ status: 404 });
  });
});

describe("reading ratings", () => {
  it("zero ratings: no average", async () => {
    expect(await getRatingSummary(T)).toEqual({ toiletId: T, average: null, count: 0, categories: {} });
  });

  it("recent ratings come newest first, without who wrote them", async () => {
    asCitizen("u1");
    await saveRating(T, { stars: 5, comment: "First" });
    asCitizen("u2");
    await saveRating(T, { stars: 3, comment: "Second" });
    const page = await listRatings(T);
    expect(page.items.map((r) => r.comment)).toEqual(["Second", "First"]);
    expect(JSON.stringify(page)).not.toMatch(/u1|u2|userId/);
  });

  it("summaries for many toilets in one call; unrated ones are listed with count 0", async () => {
    asCitizen("u1");
    await saveRating(T, { stars: 4 });
    const map = await getRatingSummaries([T, "PT-002", T]);
    expect(map.get(T)).toMatchObject({ average: 4, count: 1 });
    expect(map.get("PT-002")).toMatchObject({ average: null, count: 0 });
  });

  it("officials get the low-rated list: below 3 from at least 3 ratings", async () => {
    for (const [uid, stars] of [["a", 1], ["b", 2], ["c", 3]]) {
      asCitizen(uid);
      await saveRating(T, { stars });
    }
    asCitizen("d");
    await saveRating("PT-002", { stars: 1 }); // only one rating: not enough to call it low rated
    asCitizen("e");
    await expect(getLowRatedToilets()).rejects.toMatchObject({ status: 403 });
    startSession("official", "");
    const low = await getLowRatedToilets();
    expect(low).toEqual([{ toiletId: T, name: "Main Gate Toilet", average: 2, count: 3 }]);
  });
});
