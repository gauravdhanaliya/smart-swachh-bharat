import { useCallback, useEffect, useState } from "react";
import { getGovProfile, subscribe as subscribeGovProfile, updateGovProfile } from "../services/govProfileService";

export function useGovProfile() {
  const [profile, setProfile] = useState(getGovProfile);
  const [saveError, setSaveError] = useState("");

  useEffect(() => subscribeGovProfile(() => setProfile(getGovProfile())), []);

  // Through the API a save can be refused (validation) or fail (offline).
  const updateProfile = useCallback((partial) => {
    setSaveError("");
    return Promise.resolve(updateGovProfile(partial)).catch((err) => {
      setSaveError(err?.message || "Your changes couldn't be saved.");
    });
  }, []);

  return { profile, updateProfile, saveError };
}

/** Two-letter initials for the avatar chip, derived from the officer's name. */
export function govInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
