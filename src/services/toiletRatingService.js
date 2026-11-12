// Toilet ratings: citizens rate (one rating each per toilet; rating again
// replaces it), everyone sees the averages, officials see the low-rated list.
// Every call goes through api(): the EcoSetu API with VITE_USE_API=true, the
// browser-only stand-in otherwise (same paths, shapes and validation).
//
// Summaries are kept in memory so the map, lists and details screens agree;
// saving a rating updates them and tells every listener.

import { api } from "./api";

const summaries = new Map(); // toiletId -> { toiletId, average, count, categories }
const listeners = new Set();
const empty = (toiletId) => ({ toiletId, average: null, count: 0, categories: {} });
const path = (id) => `/toilets/${encodeURIComponent(id)}`;

function remember(summary) {
  summaries.set(summary.toiletId, summary);
  for (const cb of listeners) {
    try {
      cb(summary);
    } catch {
      // a broken listener must not stop the others
    }
  }
}

/** Called with each summary that changes. Returns an unsubscribe function. */
export function subscribeRatings(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** The last summary seen for a toilet, if any (no request). */
export const cachedSummary = (toiletId) => summaries.get(toiletId) ?? null;

export async function getRatingSummary(toiletId) {
  const summary = await api(`${path(toiletId)}/ratings/summary`);
  summaries.set(toiletId, summary);
  return summary;
}

/** Map of toiletId -> summary for many toilets (100 per request); unrated ones have count 0. */
export async function getRatingSummaries(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  const out = new Map(unique.map((id) => [id, empty(id)]));
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { items } = await api(`/toilets/ratings/summary?ids=${chunk.map(encodeURIComponent).join(",")}`);
    for (const s of items) out.set(s.toiletId, s);
  }
  for (const [id, s] of out) summaries.set(id, s);
  return out;
}

/** Recent ratings for a toilet, newest first: { items: [{ stars, categories, comment, updatedAt }], total }. */
export function listRatings(toiletId, { page = 1, limit = 20 } = {}) {
  return api(`${path(toiletId)}/ratings?page=${page}&limit=${limit}`);
}

/** The signed-in citizen's own rating of this toilet, or null. */
export async function getMyRating(toiletId) {
  const { rating } = await api(`${path(toiletId)}/rating/me`);
  return rating;
}

/** Saves (or replaces) the signed-in citizen's rating. Resolves { rating, summary }. */
export async function saveRating(toiletId, { stars, categories, comment }) {
  const body = { stars };
  if (categories && Object.keys(categories).length) body.categories = categories;
  if (comment !== undefined) body.comment = comment;
  const res = await api(`${path(toiletId)}/rating`, { method: "PUT", body });
  remember(res.summary);
  return res;
}

/** Officials: toilets averaging below 3 stars from at least 3 ratings, worst first. */
export async function getLowRatedToilets() {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const res = await api(`/toilets/ratings/low?page=${page}&limit=100`);
    items.push(...res.items);
    if (!res.hasMore) break;
  }
  return items;
}

/** Forget cached summaries (tests). */
export function resetRatingCache() {
  summaries.clear();
}
