import { useCallback, useEffect, useState } from "react";
import { cachedSummary, getMyRating, getRatingSummary, listRatings, saveRating, subscribeRatings } from "../services/toiletRatingService";

const RECENT = 10;

/**
 * One toilet's ratings: the summary, the latest ratings, and (for citizens,
 * `withMine`) their own rating. `save(input)` stores the citizen's rating and
 * resolves with it; it rejects with the API's message and per-field errors.
 */
export function useToiletRatings(toiletId, { withMine = false } = {}) {
  const [state, setState] = useState(() => ({
    summary: cachedSummary(toiletId),
    recent: [],
    mine: null,
    status: "loading",
    error: null,
  }));

  const load = useCallback(async () => {
    try {
      const [summary, page, mine] = await Promise.all([
        getRatingSummary(toiletId),
        listRatings(toiletId, { limit: RECENT }),
        withMine ? getMyRating(toiletId) : Promise.resolve(null),
      ]);
      setState({ summary, recent: page.items, mine, status: "ready", error: null });
    } catch (error) {
      setState((s) => ({ ...s, status: "error", error }));
    }
  }, [toiletId, withMine]);

  useEffect(() => {
    if (!toiletId) return undefined;
    load();
    return subscribeRatings((summary) => {
      if (summary.toiletId === toiletId) setState((s) => ({ ...s, summary }));
    });
  }, [toiletId, load]);

  const save = useCallback(
    async (input) => {
      const { rating, summary } = await saveRating(toiletId, input);
      setState((s) => ({ ...s, summary, mine: rating }));
      listRatings(toiletId, { limit: RECENT })
        .then((page) => setState((s) => ({ ...s, recent: page.items })))
        .catch(() => {}); // the summary is already right; the list catches up next time
      return rating;
    },
    [toiletId]
  );

  return { ...state, reload: load, save };
}
