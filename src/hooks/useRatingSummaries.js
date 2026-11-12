import { useEffect, useMemo, useState } from "react";
import { getRatingSummaries, subscribeRatings } from "../services/toiletRatingService";

/**
 * Rating summaries for a list of toilets: a Map of id -> { average, count }.
 * Empty until loaded; a failure leaves it empty (lists still work without
 * ratings). Saved ratings show up straight away.
 */
export function useRatingSummaries(ids) {
  const key = useMemo(() => [...new Set(ids.filter(Boolean))].sort().join(","), [ids]);
  const [map, setMap] = useState(() => new Map());

  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    getRatingSummaries(key.split(","))
      .then((next) => live && setMap(next))
      .catch(() => {});
    const off = subscribeRatings((summary) =>
      setMap((m) => (m.has(summary.toiletId) ? new Map(m).set(summary.toiletId, summary) : m))
    );
    return () => {
      live = false;
      off();
    };
  }, [key]);

  return map;
}
