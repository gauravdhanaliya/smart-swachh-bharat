// Place search and street addresses from OpenStreetMap Nominatim, following
// its usage policy (https://operations.osmfoundation.org/policies/nominatim/):
//
//   * at most one request per second for the whole app: one shared slot in
//     MongoDB, so every server instance and every user waits their turn;
//   * no autocomplete: the web app searches only when Search/Enter is pressed;
//   * identify the app: a User-Agent on every request (browsers can't set one);
//   * cache results: a week in MongoDB, shared by every user; the cache key is
//     the search words or the position rounded to 4 decimals, never a user;
//   * back off when Nominatim says it is overloaded.
//
//   GET /api/geo/search?q=Roorkee           -> { results: [{ label, latitude, longitude, wide }] }
//   GET /api/geo/reverse?lat=29.86&lon=77.89 -> { address }
//
// Signed-in users only (the API isn't an open proxy), 30 lookups a minute each.

import { ROLES } from "./constants.js";
import { rateLimit, requireRole } from "./auth.js";
import { ValidationError } from "./validate.js";
import { GEO_BUSY_MESSAGE as BUSY_MESSAGE, normaliseQuery, roundCoord } from "./geo-shared.js";

export const NOMINATIM = "https://nominatim.openstreetmap.org";
const SLOT = "geo-slot:nominatim";
const INTERVAL_MS = 1000;
const MAX_WAIT_MS = 1100; // wait for one slot at most, then say "busy"
const BACKOFF_MS = 30_000; // after Nominatim answers 429/503
const CACHE_MS = 7 * 24 * 60 * 60_000;
const TIMEOUT_MS = 8000;
// Results that are a whole town or region: the map shows the area, not a street.
const WIDE_TYPES = new Set(["country", "state", "state_district", "region", "county", "district", "city", "town", "municipality", "village", "suburb", "city_district"]);

class BusyError extends Error {}
class UpstreamError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function singleParam(value, name) {
  if (typeof value !== "string") throw new ValidationError({ [name]: `Send one ${name}.` });
  return value;
}

function coordinate(raw, name, limit) {
  const text = singleParam(raw, name).trim();
  const value = Number(text);
  if (!text || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new ValidationError({ [name]: `${name} must be a number between -${limit} and ${limit}.` });
  }
  return roundCoord(value); // about 11 m: nearby positions share a cache entry
}

export function registerGeoRoutes(app, { repo, config, wrap, fetchImpl = globalThis.fetch }) {
  const limiter = rateLimit({ ...config.geoRateLimit, repo, config, name: "geo" });

  async function takeSlot() {
    let slot = await repo.claimSlot(SLOT, INTERVAL_MS);
    if (!slot.granted && slot.waitMs <= MAX_WAIT_MS) {
      await sleep(slot.waitMs + 5);
      slot = await repo.claimSlot(SLOT, INTERVAL_MS);
    }
    if (!slot.granted) throw new BusyError();
  }

  async function nominatim(path, params) {
    await takeSlot();
    const url = new URL(path, NOMINATIM);
    for (const [k, v] of Object.entries({ format: "jsonv2", "accept-language": "en", ...params })) url.searchParams.set(k, String(v));
    let res;
    try {
      res = await fetchImpl(url.toString(), {
        headers: { "User-Agent": config.geocodeUserAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new UpstreamError();
    }
    if (res.status === 429 || res.status === 503) {
      await repo.holdSlot(SLOT, new Date(Date.now() + BACKOFF_MS), INTERVAL_MS);
      throw new BusyError();
    }
    if (!res.ok) throw new UpstreamError();
    try {
      return await res.json();
    } catch {
      throw new UpstreamError();
    }
  }

  // Cache first; otherwise one Nominatim request, cached for everyone.
  const lookup = (handler) =>
    wrap(async (req, res) => {
      try {
        res.json(await handler(req));
      } catch (err) {
        if (err instanceof BusyError) {
          res.setHeader("Retry-After", "1");
          return res.status(429).json({ error: BUSY_MESSAGE });
        }
        if (err instanceof UpstreamError) return res.status(502).json({ error: "Place search isn't available right now. Please try again later." });
        if (err instanceof ValidationError) throw err;
        // Anything else is logged as a 500. Its message could contain the
        // search words or the position, so only its type is passed on.
        const safe = new Error("Place lookup failed");
        safe.name = err?.name ?? "Error";
        throw safe;
      }
    });

  app.get("/api/geo/search", requireRole(...ROLES), limiter, lookup(async (req) => {
    const raw = singleParam(req.query.q, "q");
    const key = normaliseQuery(raw);
    if (key.length < 2 || key.length > 100) throw new ValidationError({ q: "Type 2 to 100 characters to search." });
    const cached = await repo.geocodeCacheGet(`search:${key}`);
    if (cached) return { results: cached.results ?? [] };
    const rows = await nominatim("/search", { q: raw.trim().replace(/\s+/g, " "), countrycodes: "in", limit: 5 });
    const results = (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        label: String(r.display_name ?? "").slice(0, 300),
        latitude: Number(r.lat),
        longitude: Number(r.lon),
        wide: WIDE_TYPES.has(r.addresstype ?? r.type),
      }))
      .filter((r) => r.label && Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
      .slice(0, 5);
    await repo.geocodeCachePut(`search:${key}`, { results }, CACHE_MS);
    return { results };
  }));

  app.get("/api/geo/reverse", requireRole(...ROLES), limiter, lookup(async (req) => {
    const lat = coordinate(req.query.lat, "lat", 90);
    const lon = coordinate(req.query.lon, "lon", 180);
    const key = `reverse:${lat},${lon}`;
    const cached = await repo.geocodeCacheGet(key);
    if (cached) return { address: cached.address ?? null };
    const row = await nominatim("/reverse", { lat, lon, zoom: 18 });
    const address = typeof row?.display_name === "string" ? row.display_name.slice(0, 300) : null;
    await repo.geocodeCachePut(key, { address }, CACHE_MS);
    return { address };
  }));
}
