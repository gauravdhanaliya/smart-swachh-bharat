// Live OpenStreetMap data layer.
//
// This talks to the free, public Overpass API — the same open data
// project that already provides the map tiles via Leaflet. There is
// no API key, no Google Cloud project, and no billing involved.
//
// WHAT THIS RETURNS
// Real point locations that someone has mapped on OpenStreetMap for
// the area the citizen is currently looking at:
//   - amenity=toilets                      -> public toilets
//   - amenity=waste_basket / waste_disposal
//     / recycling                          -> waste bins & recycling points
//
// DATA ACCURACY (see also src/data/bins.js and src/data/toilets.js):
// OpenStreetMap is a crowd-sourced map. A point existing here means a
// mapper recorded it there — it is NOT an official municipal record,
// and it is NOT a live IoT sensor feed. We always label these results
// "OpenStreetMap Location" (never "verified"), and bin fill levels are
// always a simulated "Prototype Live Status", never a real sensor
// reading, exactly like the rest of this demo's live data.

import { statusFromFillLevel } from "../data/bins";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const REQUEST_TIMEOUT_MS = 12000;

// --- low-level request plumbing -------------------------------------------

function anySignal(signals) {
  const controller = new AbortController();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = anySignal([options.signal, timeoutController.signal]);
  try {
    return await fetch(url, { ...options, signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildQuery(bbox, tagFilters) {
  const [south, west, north, east] = bbox;
  const clauses = tagFilters
    .map((tag) => `node[${tag}](${south},${west},${north},${east});`)
    .join("\n");
  return `[out:json][timeout:10];(${clauses});out body;`;
}

async function runOverpassQuery(query, { signal } = {}) {
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal,
        },
        REQUEST_TIMEOUT_MS
      );
      if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
      const data = await res.json();
      return data.elements ?? [];
    } catch (err) {
      if (signal?.aborted) throw err; // caller cancelled — don't try another mirror
      lastError = err; // try the next mirror
    }
  }
  throw lastError ?? new Error("Overpass request failed");
}

// --- normalisation into this app's existing bin/toilet shape ---------------

function formatAddressFromTags(tags) {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"] || tags["addr:neighbourhood"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function areaFromTags(tags) {
  return tags["addr:suburb"] || tags["addr:neighbourhood"] || tags["addr:city"] || "Nearby";
}

function normalizeOsmToilet(node) {
  const tags = node.tags ?? {};
  const address =
    formatAddressFromTags(tags) ?? `Near ${node.lat.toFixed(5)}, ${node.lon.toFixed(5)}`;

  const facilities = [];
  if (tags.male === "yes") facilities.push("Men");
  if (tags.female === "yes") facilities.push("Women");
  if (tags.unisex === "yes") facilities.push("Unisex");
  if (tags.wheelchair === "yes") facilities.push("Accessible");
  if (facilities.length === 0) facilities.push("Facilities not listed on OpenStreetMap");

  const status = tags.access === "no" || tags.access === "private" ? "Closed" : "Open";

  return {
    id: `OSM-T-${node.id}`,
    name: tags.name || "Public Toilet",
    latitude: node.lat,
    longitude: node.lon,
    area: areaFromTags(tags),
    status,
    openingHours: tags.opening_hours || "Not listed on OpenStreetMap",
    cleanliness: null,
    distance: null,
    address,
    locationLabel: "OpenStreetMap Location",
    lastUpdated: "OpenStreetMap community data",
    facilities,
    source: "osm",
  };
}

function normalizeOsmBin(node) {
  const tags = node.tags ?? {};
  const address =
    formatAddressFromTags(tags) ?? `Near ${node.lat.toFixed(5)}, ${node.lon.toFixed(5)}`;
  const kind = tags.amenity === "recycling" ? "Recycling Point" : "Waste Bin";

  // OpenStreetMap has no fill-level sensor for these — we start every
  // one at a plausible baseline and let the same "Prototype Live
  // Status" ticker used for the seed bins gently move it over time,
  // purely for demo purposes.
  const baseFill = 15 + Math.round(Math.random() * 30);

  return {
    id: `OSM-B-${node.id}`,
    name: tags.name || kind,
    latitude: node.lat,
    longitude: node.lon,
    area: areaFromTags(tags),
    type: kind,
    fillLevel: baseFill,
    status: statusFromFillLevel(baseFill),
    lastUpdated: "Prototype Live Status",
    address,
    locationLabel: "OpenStreetMap Location",
    history: Array.from({ length: 6 }, () => baseFill),
    source: "osm",
  };
}

// --- public API --------------------------------------------------------

/**
 * Fetch real public toilets from OpenStreetMap within [south, west, north, east].
 */
export async function fetchOsmToilets(bounds, { signal } = {}) {
  const query = buildQuery(bounds, ["amenity=toilets"]);
  const elements = await runOverpassQuery(query, { signal });
  return elements
    .filter((el) => el.type === "node" && typeof el.lat === "number")
    .map(normalizeOsmToilet);
}

/**
 * Fetch real waste bins / recycling points from OpenStreetMap within
 * [south, west, north, east].
 */
export async function fetchOsmBins(bounds, { signal } = {}) {
  const query = buildQuery(bounds, [
    "amenity=waste_basket",
    "amenity=waste_disposal",
    "amenity=recycling",
  ]);
  const elements = await runOverpassQuery(query, { signal });
  return elements
    .filter((el) => el.type === "node" && typeof el.lat === "number")
    .map(normalizeOsmBin);
}
