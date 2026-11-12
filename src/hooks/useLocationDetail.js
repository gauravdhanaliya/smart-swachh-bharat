import { useEffect, useState } from "react";
import { api } from "../services/api";
import { apiEnabled } from "../services/apiConfig";

/**
 * The full record behind a bin or toilet on a detail screen.
 *
 * Through the API the map only loads slim records (GET /api/locations/map),
 * so a detail screen fetches GET /api/locations/:id once. The live status
 * from the map (which the demo simulation may move) is kept on top.
 * In the browser-only build the map already holds full records.
 *
 * Returns { record, loading, error }.
 */
export function useLocationDetail(id, live, adapt) {
  const needsFetch = apiEnabled() && Boolean(id) && (!live || live.slim);
  const [state, setState] = useState({ fetched: null, loading: needsFetch, error: null });

  useEffect(() => {
    if (!needsFetch) return undefined;
    let current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(`/locations/${encodeURIComponent(id)}`)
      .then(({ location }) => current && setState({ fetched: adapt(location), loading: false, error: null }))
      .catch((error) => current && setState({ fetched: null, loading: false, error }));
    return () => {
      current = false;
    };
    // adapt is a module-level function; the record only changes with the id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, needsFetch]);

  if (!needsFetch) return { record: live ?? null, loading: false, error: null };
  const record = state.fetched && live ? { ...state.fetched, status: live.status, statusSource: live.statusSource, lastUpdated: live.lastUpdated || state.fetched.lastUpdated } : state.fetched;
  return { record, loading: state.loading, error: state.error };
}
