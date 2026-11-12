// Toilet ratings: citizens only, one per user per toilet, averages computed on
// the server, a "low rated" view for officials.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { seedAll } from "../src/seed.js";
import { DEMO_BINS, DEMO_TOILETS } from "../src/seed-data.js";
import { apiClient, startTestServer } from "./helpers.js";

let t;
let api;
const [T1, T2, T3, T4] = DEMO_TOILETS.map((p) => p.id);
let citizens;
let official;
let worker;

before(async () => {
  t = await startTestServer();
  await seedAll(t.repo, { demo: true });
  api = apiClient(t);
  citizens = [];
  for (let i = 0; i < 4; i++) citizens.push(await api.signIn(`rate-c${i}`));
  official = await api.signIn("rate-official", { role: "official" });
  worker = await api.signIn("rate-worker", { role: "worker", workerId: "w1" });
});
after(() => t.stop());

const rate = (who, toilet, body) => api.call("PUT", `/api/toilets/${toilet}/rating`, { token: who.token, body });
const summary = (toilet) => api.call("GET", `/api/toilets/${toilet}/ratings/summary`);

describe("rating", () => {
  test("a citizen rates a toilet; rating again updates the same rating", async () => {
    const first = await rate(citizens[0], T1, { stars: 4, categories: { cleanliness: 5, water: 3 }, comment: "  Clean and dry  " });
    assert.equal(first.status, 200, JSON.stringify(first.json));
    assert.equal(first.json.rating.comment, "Clean and dry");
    const second = await rate(citizens[0], T1, { stars: 2 });
    assert.equal(second.status, 200);
    assert.equal(second.json.rating.stars, 2);
    assert.deepEqual(second.json.rating.categories, {}, "a new rating replaces the old one entirely");
    assert.equal(await t.db.collection("toilet_ratings").countDocuments({ toiletId: T1, userId: "rate-c0" }), 1);
    assert.equal(second.json.summary.count, 1);

    const mine = await api.call("GET", `/api/toilets/${T1}/rating/me`, { token: citizens[0].token });
    assert.equal(mine.json.rating.stars, 2);
    const none = await api.call("GET", `/api/toilets/${T1}/rating/me`, { token: citizens[1].token });
    assert.equal(none.json.rating, null);
  });

  test("the same user rating twice at the same moment still makes one rating", async () => {
    await Promise.all([rate(citizens[3], T4, { stars: 5 }), rate(citizens[3], T4, { stars: 4 }), rate(citizens[3], T4, { stars: 3 })]);
    assert.equal(await t.db.collection("toilet_ratings").countDocuments({ toiletId: T4, userId: "rate-c3" }), 1);
  });

  test("only citizens can rate", async () => {
    assert.equal((await rate(official, T1, { stars: 5 })).status, 403);
    assert.equal((await rate(worker, T1, { stars: 5 })).status, 403);
    assert.equal((await api.call("PUT", `/api/toilets/${T1}/rating`, { body: { stars: 5 } })).status, 401);
  });

  test("validation: whole stars 1 to 5, known categories 1 to 5, comment up to 300, nothing else", async () => {
    const cases = [
      [{ stars: 0 }, "stars"],
      [{ stars: 6 }, "stars"],
      [{ stars: 3.5 }, "stars"],
      [{ stars: "4" }, "stars"],
      [{}, "stars"],
      [{ stars: 4, categories: { smell: 3 } }, "categories"],
      [{ stars: 4, categories: { cleanliness: 9 } }, "categories"],
      [{ stars: 4, categories: [] }, "categories"],
      [{ stars: 4, comment: "x".repeat(301) }, "comment"],
      [{ stars: 4, comment: { $ne: "" } }, "comment"],
      [{ stars: 4, userId: "someone-else" }, "userId"],
    ];
    for (const [body, field] of cases) {
      const res = await rate(citizens[1], T2, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.json.fields?.[field], `${field}: ${JSON.stringify(res.json)}`);
    }
    assert.equal((await rate(citizens[1], T2, { stars: 4, comment: "" })).status, 200, "an empty comment is fine");
  });

  test("only public toilets that exist can be rated", async () => {
    assert.equal((await rate(citizens[1], DEMO_BINS[0].id, { stars: 3 })).status, 404);
    assert.equal((await rate(citizens[1], "PT-404", { stars: 3 })).status, 404);
  });
});

describe("averages", () => {
  test("computed on the server: one decimal, count, and per-category averages", async () => {
    await rate(citizens[0], T3, { stars: 1, categories: { cleanliness: 1 } });
    await rate(citizens[1], T3, { stars: 2, categories: { cleanliness: 2, safety: 4 } });
    await rate(citizens[2], T3, { stars: 2 });
    const res = await summary(T3);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      toiletId: T3,
      average: 1.7,
      count: 3,
      categories: { cleanliness: { average: 1.5, count: 2 }, safety: { average: 4, count: 1 } },
    });
  });

  test("a toilet with no ratings has a null average and a zero count", async () => {
    const fresh = (await api.call("POST", "/api/locations", {
      token: official.token,
      body: { name: "Unrated", type: "public_toilet", latitude: 29.89, longitude: 77.96, address: "x" },
    })).json.location;
    assert.deepEqual((await summary(fresh.id)).json, { toiletId: fresh.id, average: null, count: 0, categories: {} });
  });

  test("summaries for many toilets in one call, for the map", async () => {
    const res = await api.call("GET", `/api/toilets/ratings/summary?ids=${T1},${T3},PT-404`);
    assert.equal(res.status, 200);
    const byId = Object.fromEntries(res.json.items.map((s) => [s.toiletId, s]));
    assert.equal(byId[T3].average, 1.7);
    assert.equal(byId["PT-404"], undefined);
    assert.equal((await api.call("GET", `/api/toilets/ratings/summary?ids=${"PT-1,".repeat(101)}`)).status, 400, "at most 100 ids");
  });

  test("the latest comments are public but anonymous, and paged", async () => {
    await rate(citizens[2], T1, { stars: 5, comment: "Spotless today" });
    const res = await api.call("GET", `/api/toilets/${T1}/ratings`);
    assert.equal(res.status, 200);
    assert.ok(res.json.items.some((r) => r.comment === "Spotless today"));
    assert.ok(res.json.items.every((r) => !("userId" in r) && !("_id" in r)));
    assert.deepEqual([res.json.page, res.json.limit], [1, 20]);
  });
});

describe("low rated (officials)", () => {
  test("lists toilets averaging below 3 with at least 3 ratings", async () => {
    // a fresh toilet with only two (very) low ratings: not enough to count
    const twoRatings = (await api.call("POST", "/api/locations", {
      token: official.token,
      body: { name: "Two ratings", type: "public_toilet", latitude: 29.89, longitude: 77.96, address: "x" },
    })).json.location.id;
    await rate(citizens[2], twoRatings, { stars: 1 });
    await rate(citizens[3], twoRatings, { stars: 1 });
    const res = await api.call("GET", "/api/toilets/ratings/low", { token: official.token });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const ids = res.json.items.map((s) => s.toiletId);
    assert.ok(ids.includes(T3), "1.7 from 3 ratings is low");
    assert.ok(!ids.includes(twoRatings), "only 3 ratings or more count");
    assert.ok(!ids.includes(T1), "an average of 3 or more is not low");
    assert.ok(res.json.items.every((s) => s.average < 3 && s.count >= 3));
    assert.equal(res.json.total, res.json.items.length);
  });

  test("is for officials only", async () => {
    assert.equal((await api.call("GET", "/api/toilets/ratings/low", { token: citizens[0].token })).status, 403);
    assert.equal((await api.call("GET", "/api/toilets/ratings/low", { token: worker.token })).status, 403);
  });
});
