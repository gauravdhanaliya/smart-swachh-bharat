// Place search and street-address lookup through OpenStreetMap Nominatim.
//
// Nominatim's usage policy: at most 1 request per second for the whole
// application, no autocomplete, identify the application, cache results. The
// browser can't set a User-Agent and can't see other users' requests, so the
// API makes every Nominatim call: one shared 1-per-second slot in MongoDB,
// results cached in MongoDB, and an app User-Agent on every request.

import { test, before, after, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { apiClient, startTestServer } from "./helpers.js";

const BUSY = "Search is busy, try again in a moment";

// A stand-in for nominatim.openstreetmap.org that records every call.
function fakeNominatim() {
  const calls = [];
  let next = null; // { status } to answer the next call with
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: new URL(url), headers: options.headers ?? {}, at: Date.now() });
    const answer = next;
    next = null;
    if (answer) return new Response(JSON.stringify({ error: "x" }), { status: answer.status });
    const u = new URL(url);
    if (u.pathname === "/reverse") {
      return Response.json({ display_name: `Street at ${u.searchParams.get("lat")}, ${u.searchParams.get("lon")}` });
    }
    const q = u.searchParams.get("q");
    return Response.json([
      { display_name: `${q}, Uttarakhand, India`, lat: "29.8543", lon: "77.8880", addresstype: "city", extra: "dropped" },
      { display_name: `${q} Railway Station`, lat: "29.8650", lon: "77.8900", addresstype: "railway" },
    ]);
  };
  return {
    fetchImpl,
    calls,
    failNext(status) {
      next = { status };
    },
    reset() {
      calls.length = 0;
      next = null;
    },
  };
}

let t;
let api;
let geo;
let citizen;
let other;

before(async () => {
  geo = fakeNominatim();
  t = await startTestServer({ ECOSETU_GEOCODE_USER_AGENT: "EcoSetu-test/1.0 (+https://example.test)" }, { geoFetch: geo.fetchImpl });
  api = apiClient(t);
  citizen = await api.signIn("geo-citizen");
  other = await api.signIn("geo-other");
});
after(() => t.stop());

// Each test starts with no cache and a free slot.
beforeEach(async () => {
  geo.reset();
  await t.db.collection("geocode_cache").deleteMany({});
  await t.db.collection("auth_rate_limits").deleteMany({});
});

const search = (q, who = citizen) => api.call("GET", `/api/geo/search?q=${encodeURIComponent(q)}`, { token: who.token });
const reverse = (lat, lon, who = citizen) => api.call("GET", `/api/geo/reverse?lat=${lat}&lon=${lon}`, { token: who.token });

describe("place search", () => {
  test("needs a signed-in user (the API isn't an open Nominatim proxy)", async () => {
    assert.equal((await api.call("GET", "/api/geo/search?q=Roorkee")).status, 401);
    assert.equal(geo.calls.length, 0);
  });

  test("one search is one Nominatim request, identified as this app, limited to India", async () => {
    const res = await search("Roorkee");
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.deepEqual(res.json.results[0], { label: "Roorkee, Uttarakhand, India", latitude: 29.8543, longitude: 77.888, wide: true });
    assert.equal(res.json.results[1].wide, false);
    assert.equal(geo.calls.length, 1);
    const { url, headers } = geo.calls[0];
    assert.equal(url.origin + url.pathname, "https://nominatim.openstreetmap.org/search");
    assert.equal(url.searchParams.get("q"), "Roorkee");
    assert.equal(url.searchParams.get("format"), "jsonv2");
    assert.equal(url.searchParams.get("countrycodes"), "in");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(headers["User-Agent"], "EcoSetu-test/1.0 (+https://example.test)");
  });

  test("results are cached: the same search again (any case or spacing, any user) makes no request", async () => {
    await search("Roorkee  Station");
    const again = await search("  roorkee station ", other);
    assert.equal(again.status, 200);
    assert.equal(again.json.results.length, 2);
    assert.equal(geo.calls.length, 1);
  });

  test("never more than one Nominatim request per second, however many users search at once", async () => {
    const results = await Promise.all(["Haridwar", "Dehradun", "Rishikesh", "Mussoorie"].map((q, i) => search(q, i % 2 ? other : citizen)));
    const ok = results.filter((r) => r.status === 200).length;
    const busy = results.filter((r) => r.status === 429);
    assert.ok(ok >= 1, "at least one search gets through");
    assert.equal(ok + busy.length, 4);
    for (const r of busy) assert.equal(r.json.error, BUSY);
    assert.equal(geo.calls.length, ok);
    const times = geo.calls.map((c) => c.at).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] - times[i - 1] >= 990, `requests ${times[i] - times[i - 1]} ms apart`);
    }
  });

  test("a second search waits for the slot instead of failing", async () => {
    const first = await search("Haridwar");
    const second = await search("Dehradun", other);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.ok(geo.calls[1].at - geo.calls[0].at >= 990);
  });

  test("Nominatim saying 429 is passed on as 'busy', and nobody calls it again for a while", async () => {
    geo.failNext(429);
    const res = await search("Roorkee");
    assert.equal(res.status, 429);
    assert.equal(res.json.error, BUSY);
    const soon = await search("Haridwar", other);
    assert.equal(soon.status, 429);
    assert.equal(geo.calls.length, 1, "backing off: no second request");
  });

  test("a Nominatim failure is a 502 and isn't cached", async () => {
    geo.failNext(500);
    assert.equal((await search("Roorkee")).status, 502);
    await t.db.collection("auth_rate_limits").deleteMany({});
    assert.equal((await search("Roorkee")).status, 200);
    assert.equal(geo.calls.length, 2);
  });

  test("the query is checked: 2 to 100 characters, text only", async () => {
    for (const q of ["", " ", "a", "x".repeat(101)]) {
      const res = await search(q);
      assert.equal(res.status, 400, JSON.stringify(q));
    }
    assert.equal((await api.call("GET", "/api/geo/search?q=a&q=b", { token: citizen.token })).status, 400);
    assert.equal(geo.calls.length, 0);
  });

  test("each user can search at most 30 times a minute", async () => {
    await t.db.collection("geocode_cache").insertOne({ _id: "search:roorkee", results: [], expiresAt: new Date(Date.now() + 60_000) });
    let last;
    for (let i = 0; i < 31; i++) last = await search("Roorkee");
    assert.equal(last.status, 429);
    assert.equal((await search("Roorkee", other)).status, 200, "other users aren't affected");
  });
});

describe("street address for a GPS position", () => {
  test("looks it up once, then answers nearby repeats (same 4 decimals, about 11 m) from the cache", async () => {
    const res = await reverse(29.864512, 77.896381);
    assert.equal(res.status, 200);
    assert.equal(res.json.address, "Street at 29.8645, 77.8964", "Nominatim gets the rounded position");
    assert.equal(geo.calls[0].url.pathname, "/reverse");
    assert.equal(geo.calls[0].url.searchParams.get("format"), "jsonv2");
    assert.equal(geo.calls[0].headers["User-Agent"], "EcoSetu-test/1.0 (+https://example.test)");
    const again = await reverse(29.86453, 77.89641, other);
    assert.equal(again.json.address, res.json.address);
    assert.equal(geo.calls.length, 1);
  });

  test("coordinates are checked", async () => {
    for (const [lat, lon] of [["x", 77], [91, 77], [29, 181], ["", ""]]) {
      assert.equal((await reverse(lat, lon)).status, 400, `${lat},${lon}`);
    }
    assert.equal(geo.calls.length, 0);
  });

  test("shares the one-per-second slot with place search", async () => {
    await search("Roorkee");
    await reverse(29.86, 77.89);
    assert.ok(geo.calls[1].at - geo.calls[0].at >= 990);
  });
});
