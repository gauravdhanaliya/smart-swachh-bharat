// Errors in the app's screens: what is logged and the reference shown.
// Only the error's type and a random reference are logged — never its
// message or stack, which can contain personal data (a phone number in a
// field, a token, an address).

export const LOG_PREFIX = "[EcoSetu] screen error";

/** "EC-1A2B-3C4D": quoted by the user so the team can find the log line. */
export function newReference() {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `EC-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/** The error's type name if it is a plain identifier (TypeError…), otherwise "Error". */
export function errorType(error) {
  const name = error && typeof error === "object" ? error.name : null;
  return typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}

export function logUiError(error, ref) {
  console.error(LOG_PREFIX, { type: errorType(error), ref });
}
