import { useEffect, useState, useSyncExternalStore } from "react";
import { BIN_STATUS } from "../data/bins";
import { getAllBins, subscribe as subscribeFacilities } from "../services/facilityService";

// Step 14D — bins now come from the shared facility store (demo +
// Government-added + Government-approved Worker requests), not just the
// static demo seed array, so newly added dustbins show up everywhere
// useLiveBins() is used (Citizen Map, Citizen Home, Bin Details,
// Government Bins page).

// ---------------------------------------------------------------------
// DEMO LIVE DATA SIMULATION
// This mimics an IoT/backend feed pushing status updates so the map
// "feels" live for the presentation. Bins have a categorical status only
// (no fill percentage), so the simulation moves a bin from one status to
// the next. Set SIMULATE_LIVE_DATA to false to freeze the data at its
// saved values (e.g. once a real backend/IoT feed is wired up).
// ---------------------------------------------------------------------
export const SIMULATE_LIVE_DATA = true;
const UPDATE_INTERVAL_MS = 20000; // 20s — gentle enough not to be jarring
export const STATUS_CHANGE_CHANCE = 0.12; // per bin, per tick

// normal -> almost full -> overflow -> (collected) normal
const NEXT_STATUS = {
  [BIN_STATUS.NORMAL]: BIN_STATUS.ALMOST_FULL,
  [BIN_STATUS.ALMOST_FULL]: BIN_STATUS.OVERFLOW,
  [BIN_STATUS.OVERFLOW]: BIN_STATUS.NORMAL,
};

/**
 * The simulated next status for a bin. `roll` is a random number in [0, 1):
 * below STATUS_CHANGE_CHANCE the bin moves one step, otherwise it stays put.
 * An unknown status is treated as normal.
 */
export function nextBinStatus(status, roll = Math.random()) {
  const current = status in NEXT_STATUS ? status : BIN_STATUS.NORMAL;
  return roll < STATUS_CHANGE_CHANCE ? NEXT_STATUS[current] : current;
}

/**
 * One simulation tick over a list of bins. A bin whose status an official or
 * worker set (`statusSource: "manual"`) is never changed; every other bin
 * rolls the dice. Unchanged bins keep their object identity.
 */
export function simulateTick(bins, random = Math.random) {
  return bins.map((bin) => {
    if (bin.statusSource === "manual") return bin;
    const status = nextBinStatus(bin.status, random());
    return status === bin.status ? bin : { ...bin, status, lastUpdated: "Just now" };
  });
}

/**
 * Generic version of the ticker: takes ANY array of bin-shaped objects
 * (anything with a `status`) and occasionally moves their status over
 * time. Used both for the saved bins and for bins fetched live from
 * OpenStreetMap.
 */
export function useTickingBinStatus(sourceBins) {
  const [liveBins, setLiveBins] = useState(sourceBins);

  // Re-seed whenever a fresh source array comes in (e.g. a new
  // OpenStreetMap fetch), then keep ticking independently from there.
  useEffect(() => {
    setLiveBins(sourceBins);
  }, [sourceBins]);

  useEffect(() => {
    if (!SIMULATE_LIVE_DATA) return undefined;

    const timer = setInterval(() => {
      setLiveBins((current) => simulateTick(current));
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [sourceBins]);

  return liveBins;
}

export function useLiveBins() {
  // useSyncExternalStore re-reads the store as it subscribes, so an update
  // that lands between the first render and the subscription (e.g. the
  // sign-in refresh answering as the first screen mounts) is never missed.
  // getAllBins() keeps the same array until the store changes. This replaces
  // the old 8-second safety-net poll, which only papered over that gap.
  const sourceBins = useSyncExternalStore(subscribeFacilities, getAllBins);
  return useTickingBinStatus(sourceBins);
}
