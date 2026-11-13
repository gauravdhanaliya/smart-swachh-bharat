import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  LOGIN_METHOD,
  clearLegacySessions,
  clearSession,
  isSessionKey,
  readSession,
  startOtpSession,
  startSession,
} from "../services/authSession";
import { signOutUser } from "../services/authService";
import { selectWorker } from "../hooks/useWorkerSession";
import { refreshAfterSignIn, resetStore as resetLocations } from "../services/locationStore";
import { resetComplaintCache } from "../services/complaintService";
import { resetGovProfileCache } from "../services/govProfileService";
import { resetWorkerCache } from "../services/workerService";
import { reset as resetNotifications } from "../services/notificationRemote";
import { clearConsentCache } from "../services/consentService";

// One user's cached data must never show to the next one.
const resetStore = () => {
  resetLocations();
  resetComplaintCache();
  resetGovProfileCache();
  resetWorkerCache();
  resetNotifications();
  clearConsentCache();
};

// A (different) user has just signed in: drop the last one's data and fetch
// the shared map data for this one now, not at the next 30-second poll.
const startFresh = () => {
  resetStore();
  refreshAfterSignIn();
};
import { apiEnabled } from "../services/apiConfig";
import { SESSION_EXPIRED_MESSAGE, getSessionClient } from "../services/session";

const AuthContext = createContext(null);

// The API's user ({ uid, role, name, phone, isDemo, wid }) in the shape the
// screens already use ({ id, name, role, method, phone?, workerId }).
function toAppUser(u) {
  if (!u) return null;
  return {
    id: u.uid,
    name: u.name || u.role,
    role: u.role,
    method: u.isDemo ? LOGIN_METHOD.DEMO : LOGIN_METHOD.OTP,
    ...(u.phone ? { phone: u.phone } : {}),
    workerId: u.wid ?? null,
  };
}

/**
 * The signed-in user.
 *
 * Browser-local mode (default): the session in services/authSession.js.
 * API mode (VITE_USE_API=true): the session from services/session.js — the
 * access token in memory only, restored from the refresh cookie on page load
 * (`status` is "loading" until then), and the role always from the server.
 * A session that ends on its own (a refused refresh) sets `notice`, which the
 * login page shows.
 */
export function AuthProvider({ children }) {
  const [useApi] = useState(apiEnabled);
  const [user, setUser] = useState(() => (useApi ? null : readSession()));
  const [status, setStatus] = useState(useApi ? "loading" : "ready");
  const [notice, setNotice] = useState("");
  // Who the caches were last reset for, so a session change for the same
  // person (a token refresh) doesn't wipe and re-fetch everything.
  const userIdRef = useRef(user?.id ?? null);
  const followUser = (next) => {
    const id = next?.id ?? null;
    if (id !== userIdRef.current) {
      if (id) startFresh();
      else resetStore();
      userIdRef.current = id;
    }
    setUser(next);
  };

  useEffect(() => {
    clearLegacySessions();
  }, []);

  // Browser-local mode: signing in or out in another tab applies here too.
  useEffect(() => {
    if (useApi) return undefined;
    const onStorage = (e) => {
      if (e.key === null || isSessionKey(e.key)) followUser(readSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [useApi]);

  // API mode: follow the session client, and restore the session once on load.
  // restore() is memoised, so StrictMode running this effect twice still sends
  // a single /refresh.
  useEffect(() => {
    if (!useApi) return undefined;
    const client = getSessionClient();
    let live = true;
    const off = client.onChange(({ user: next, reason }) => {
      const appUser = toAppUser(next);
      if (appUser?.role === "worker" && appUser.workerId) selectWorker(appUser.workerId);
      // Every sign-in arrives here (this tab's own logins and other tabs'), so
      // this is where a new user's data is fetched.
      followUser(appUser);
      if (reason === "expired") setNotice(SESSION_EXPIRED_MESSAGE);
    });
    client
      .restore()
      .then((session) => {
        if (live && session) followUser(toAppUser(session.user));
      })
      .catch((err) => {
        if (live) setNotice(err.message);
      })
      .finally(() => {
        if (live) setStatus("ready");
      });
    return () => {
      live = false;
      off();
    };
  }, [useApi]);

  /** Demo login. Returns the new user (a Promise in API mode). */
  const login = (role, name) => {
    setNotice("");
    if (useApi) {
      // The server signs in as its seeded demo user for this role; nothing else is sent.
      return getSessionClient()
        .loginDemo(role)
        .then(({ user: u }) => toAppUser(u)); // the client's onChange (above) has applied it
    }
    const session = startSession(role, name);
    if (role === "worker") selectWorker(session.id);
    userIdRef.current = session.id;
    startFresh();
    setUser(session);
    return session;
  };

  /** Phone login, after Firebase has verified the OTP. The server (or, locally, the client) makes it a citizen. */
  const loginWithOtp = ({ uid, phone, idToken }) => {
    setNotice("");
    if (useApi) {
      return getSessionClient()
        .loginFirebase(idToken)
        .then(({ user: u }) => toAppUser(u)); // the client's onChange (above) has applied it
    }
    const session = startOtpSession({ uid, phone });
    userIdRef.current = session.id;
    startFresh();
    setUser(session);
    return session;
  };

  /** Signs out. `notice` is shown on the login page (e.g. after withdrawing consent). */
  const resetAuth = ({ notice: message = "" } = {}) => {
    // OTP sessions also hold a Firebase sign-in; signOutUser never rejects.
    if (user?.method === LOGIN_METHOD.OTP) signOutUser();
    if (useApi) getSessionClient().logout();
    else clearSession();
    resetStore();
    userIdRef.current = null;
    setNotice(message);
    setUser(null);
  };

  const value = {
    user,
    role: user?.role ?? null,
    isAuthenticated: Boolean(user),
    status,
    notice,
    usesApi: useApi,
    login,
    loginWithOtp,
    resetAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
