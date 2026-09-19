import { useCallback, useEffect, useState } from "react";
import { getGovProfile, subscribe as subscribeGovProfile, updateGovProfile } from "../services/govProfileService";

export function useGovProfile() {
  const [profile, setProfile] = useState(getGovProfile);

  useEffect(() => subscribeGovProfile(() => setProfile(getGovProfile())), []);

  const updateProfile = useCallback((partial) => {
    updateGovProfile(partial);
  }, []);

  return { profile, updateProfile };
}

/** Two-letter initials for the avatar chip, derived from the officer's name. */
export function govInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
