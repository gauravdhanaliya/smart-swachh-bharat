import { useEffect, useState } from "react";
import { getSessionClient } from "../services/session";

/**
 * Whether the login page offers "Try the demo".
 *   - browser-only build: always (the demo users live in this browser)
 *   - API mode: only if the server says so (GET /api/auth/config). Until it
 *     answers this is null; if it can't be asked, false (fails closed: the
 *     phone login is always there).
 */
export function useDemoLoginEnabled(usesApi) {
  const [enabled, setEnabled] = useState(null);

  useEffect(() => {
    if (!usesApi) return undefined;
    let live = true;
    getSessionClient()
      .getAuthConfig()
      .then(
        (config) => live && setEnabled(config.demoLoginEnabled),
        () => live && setEnabled(false)
      );
    return () => {
      live = false;
    };
  }, [usesApi]);

  return usesApi ? enabled : true;
}
