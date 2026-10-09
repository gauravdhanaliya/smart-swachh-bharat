import { useCallback, useEffect, useState } from "react";
import {
  getRemovedFacilities,
  removeFacility,
  restoreAllFacilities,
  restoreFacility,
  subscribe as subscribeFacilities,
} from "../services/facilityService";
import { useGovProfile } from "./useGovProfile";

// Step 14E — the Government "Remove Facility" flow, shared by the Bins
// and Public Toilets pages so both behave identically.
//
// Mirrors useFacilityRequests/useLiveBins: the service owns the data,
// this hook owns only the transient UI state (is remove mode on, which
// facility is awaiting confirmation, is an Undo still offered).
const UNDO_WINDOW_MS = 10000;

export function useFacilityRemoval(category) {
  const { profile } = useGovProfile();
  // "remove mode" keeps destructive buttons off the cards until
  // Government explicitly asks for them — same reason Add Facility is a
  // deliberate click rather than an always-open form.
  const [removeMode, setRemoveMode] = useState(false);
  const [pending, setPending] = useState(null); // facility awaiting confirmation
  const [lastRemoved, setLastRemoved] = useState(null); // powers the Undo bar
  const [removed, setRemoved] = useState(() => getRemovedFacilities(category));

  useEffect(
    () => subscribeFacilities(() => setRemoved(getRemovedFacilities(category))),
    [category]
  );

  // The Undo offer expires on its own so it never lingers over the list.
  useEffect(() => {
    if (!lastRemoved) return undefined;
    const timer = setTimeout(() => setLastRemoved(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [lastRemoved]);

  const requestRemove = useCallback((facility) => setPending(facility), []);
  const cancelRemove = useCallback(() => setPending(null), []);

  const [error, setError] = useState("");
  const attempt = useCallback(async (fn) => {
    setError("");
    try {
      return await fn();
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  const confirmRemove = useCallback(
    async (reason) => {
      if (!pending) return;
      const facility = pending;
      setPending(null);
      const record = await attempt(() =>
        removeFacility(facility, { category, reason, removedBy: profile.name })
      );
      if (record) setLastRemoved(record);
    },
    [pending, category, profile.name, attempt]
  );

  const undoRemove = useCallback(async () => {
    if (!lastRemoved) return;
    const id = lastRemoved.id;
    setLastRemoved(null);
    await attempt(() => restoreFacility(id));
  }, [lastRemoved, attempt]);

  const restore = useCallback(
    async (id) => {
      setLastRemoved((current) => (current && current.id === id ? null : current));
      await attempt(() => restoreFacility(id));
    },
    [attempt]
  );

  const restoreAll = useCallback(async () => {
    setLastRemoved(null);
    await attempt(() => restoreAllFacilities(category));
  }, [category, attempt]);

  const dismissUndo = useCallback(() => setLastRemoved(null), []);

  const toggleRemoveMode = useCallback(() => {
    setRemoveMode((on) => {
      if (on) setPending(null); // leaving remove mode closes any open dialog
      return !on;
    });
  }, []);

  return {
    removeMode,
    toggleRemoveMode,
    pending,
    requestRemove,
    cancelRemove,
    confirmRemove,
    lastRemoved,
    undoRemove,
    dismissUndo,
    removed,
    restore,
    restoreAll,
    error,
  };
}
