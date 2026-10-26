import { useEffect, useReducer } from "react";
import { getProfile, subscribe } from "../services/profileService";

/** The saved profile for `role` (null until it's filled in), live-updating. */
export function useProfile(role) {
  // Read on every render (a small JSON parse) and re-render on any change,
  // so a different `role` or a save elsewhere is picked up straight away.
  const [, rerender] = useReducer((n) => n + 1, 0);

  useEffect(() => subscribe(rerender), []);

  return getProfile(role);
}
