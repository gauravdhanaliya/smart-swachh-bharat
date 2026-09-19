import { useEffect, useState } from "react";
import { statusFromFillLevel } from "../data/bins";
import { getAllBins, subscribe as subscribeFacilities } from "../services/facilityService";

// Step 14D — bins now come from the shared facility store (demo +
// Government-added + Government-approved Worker requests), not just the
// static demo seed array, so newly added dustbins show up everywhere
// useLiveBins() is used (Citizen Map, Citizen Home, Bin Details,
// Government Bins page).
const REFRESH_POLL_MS = 8000; // safety-net poll per bug-fix spec §7 (5–10s)

// ---------------------------------------------------------------------
// DEMO LIVE DATA SIMULATION
// This mimics an IoT/backend feed pushing fill-level updates so the
// map "feels" live for the presentation. Set SIMULATE_LIVE_DATA to
// false to freeze the data at its seed values (e.g. once a real
// backend/IoT feed is wired up in a later step).
//
// ---------------------------------------------------------------------
export const SIMULATE_LIVE_DATA = true;
const UPDATE_INTERVAL_MS = 20000; // 20s — gentle enough not to be jarring
const MAX_STEP = 4; // max +/- change in fill % per tick

function nudgeFillLevel(fillLevel) {
  const delta = Math.round((Math.random() - 0.45) * MAX_STEP * 2);
  return Math.max(5, Math.min(99, fillLevel + delta));
}

/**
 * Generic version of the ticker: takes ANY array of bin-shaped objects
 * (anything with a numeric `fillLevel`) and gently drifts their fill
 * levels/status/history over time. Used both for the built-in seed
 * bins and for bins fetched live from OpenStreetMap.
 */
export function useTickingFillLevels(sourceBins) {
  const [liveBins, setLiveBins] = useState(sourceBins);

  // Re-seed whenever a fresh source array comes in (e.g. a new
  // OpenStreetMap fetch), then keep ticking independently from there.
  useEffect(() => {
    setLiveBins(sourceBins);
  }, [sourceBins]);

  useEffect(() => {
    if (!SIMULATE_LIVE_DATA) return undefined;

    const timer = setInterval(() => {
      setLiveBins((current) =>
        current.map((bin) => {
          if (typeof bin.fillLevel !== "number") return bin;
          const fillLevel = nudgeFillLevel(bin.fillLevel);
          return {
            ...bin,
            fillLevel,
            status: statusFromFillLevel(fillLevel),
            lastUpdated: "Just now",
            history: bin.history ? [...bin.history.slice(1), fillLevel] : bin.history,
          };
        })
      );
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [sourceBins]);

  return liveBins;
}

export function useLiveBins() {
  const [sourceBins, setSourceBins] = useState(() => getAllBins());

  useEffect(() => {
    const refresh = () => setSourceBins(getAllBins());
    const unsubscribe = subscribeFacilities(refresh);
    const poll = setInterval(refresh, REFRESH_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, []);

  return useTickingFillLevels(sourceBins);
}
