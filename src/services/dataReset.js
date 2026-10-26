// Wiping EcoSetu's browser data.
//
// Every key the app stores starts with "ssb_" or "ecosetu_". Bumping
// DATA_VERSION makes every browser — the Vercel site included — clear those
// keys once on its next load (main.jsx calls ensureDataVersion() before the
// app renders), so all users start from empty data together. The Profile
// pages' "Reset all data" button uses clearAllData() directly.

export const DATA_VERSION_KEY = "ecosetu_data_version";
export const DATA_VERSION = 2;

const PREFIXES = ["ssb_", "ecosetu_"];

export function isEcoSetuKey(key) {
  return typeof key === "string" && PREFIXES.some((p) => key.startsWith(p));
}

function clearStorage(storage) {
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    keys.filter(isEcoSetuKey).forEach((k) => storage.removeItem(k));
  } catch {
    // storage blocked — nothing to clear
  }
}

/** Removes every EcoSetu key (data, profiles, session) and records the current data version. */
export function clearAllData() {
  if (typeof localStorage !== "undefined") clearStorage(localStorage);
  if (typeof sessionStorage !== "undefined") clearStorage(sessionStorage);
  try {
    localStorage.setItem(DATA_VERSION_KEY, String(DATA_VERSION));
  } catch {
    // storage blocked
  }
}

/** Clears all EcoSetu data once if it was written by a different data version. Returns true if it did. */
export function ensureDataVersion() {
  let stored = null;
  try {
    stored = localStorage.getItem(DATA_VERSION_KEY);
  } catch {
    return false;
  }
  if (stored === String(DATA_VERSION)) return false;
  clearAllData();
  return true;
}
