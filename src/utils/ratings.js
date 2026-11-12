// Toilet rating helpers shared by the screens and the browser-only API.
// The API computes the same summary in MongoDB (server/src/civic.js).

export const RATING_LABELS = {
  cleanliness: "Cleanliness",
  water: "Water availability",
  lighting: "Lighting",
  safety: "Safety",
  accessibility: "Accessibility",
};

export const COMMENT_MAX_LENGTH = 300;

// "Low rated" for officials: below 3 stars on average, from at least 3 ratings.
export const LOW_RATED_BELOW = 3;
export const LOW_RATED_MIN_COUNT = 3;

const round1 = (n) => Math.round(n * 10) / 10;

/** { average (one decimal) | null, count, categories: { key: { average, count } } }. */
export function summarizeRatings(ratings) {
  if (!ratings.length) return { average: null, count: 0, categories: {} };
  const categories = {};
  for (const r of ratings) {
    for (const [key, value] of Object.entries(r.categories ?? {})) {
      const c = (categories[key] ??= { total: 0, count: 0 });
      c.total += value;
      c.count += 1;
    }
  }
  return {
    average: round1(ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length),
    count: ratings.length,
    categories: Object.fromEntries(
      Object.entries(categories)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, c]) => [key, { average: round1(c.total / c.count), count: c.count }])
    ),
  };
}

export function isLowRated(summary) {
  return Boolean(summary && summary.average != null && summary.count >= LOW_RATED_MIN_COUNT && summary.average < LOW_RATED_BELOW);
}

export const formatAverage = (average) => (average == null ? "–" : (Math.round(average * 10) / 10).toFixed(1));

export const ratingCountLabel = (count) => (count ? `${count} rating${count === 1 ? "" : "s"}` : "No ratings yet");
