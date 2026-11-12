// VITE_USE_API=true: sign in through the EcoSetu API (server-issued tokens,
// roles from the database). Anything else: the browser-local demo build, which
// needs no server at all. Read at call time so tests can switch it.
//
// Until Step 16 Phase 4, only sign-in uses the API; the data services still
// read the browser-local store either way.
export function apiEnabled() {
  return import.meta.env.VITE_USE_API === "true";
}
