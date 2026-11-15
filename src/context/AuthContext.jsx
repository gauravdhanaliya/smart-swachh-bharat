import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  LOGIN_METHOD,
  clearLegacySessions,
  clearSession,
  isSessionKey,
  markSignedOut,
  readSession,
  startEmailSession,
  startSession,
  updateSession,
} from "../services/authSession";
import * as authService from "../services/authService";
import { selectWorker } from "../hooks/useWorkerSession";
import { refreshAfterSignIn, resetStore as resetLocations } from "../services/locationStore";
import { resetComplaintCache } from "../services/complaintService";
import { resetGovProfileCache } from "../services/govProfileService";
import { resetWorkerCache } from "../services/workerService";
import { reset as resetNotifications } from "../services/notificationRemote";
import { clearConsentCache, deviceConsent } from "../services/consentService";
import { apiEnabled } from "../services/apiConfig";
import { SESSION_EXPIRED_MESSAGE, getSessionClient } from "../services/session";

// Every way of signing in checks this first: nothing is created in Firebase or
// on the server until the user has agreed on the consent step (ChooseRole).
function requireDeviceConsent() {
  if (!deviceConsent()) {
    const error = new Error("Please read and agree to the privacy notice first.");
    error.code = "consent/required";
    throw error;
  }
}

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

const AuthContext = createContext(null);

const METHOD_BY_ACCOUNT = {
  email: LOGIN_METHOD.EMAIL,
  legacy: LOGIN_METHOD.LEGACY,
  demo: LOGIN_METHOD.DEMO,
};

// The API's user ({ uid, role, name, isDemo, wid, account }) in the shape the
// screens use ({ id, name, role, method, email, emailVerified, workerId }).
function toAppUser(u) {
  if (!u) return null;
  const account = u.account ?? {};
  return {
    id: u.uid,
    name: u.name || u.role,
    role: u.role,
    method: u.isDemo ? LOGIN_METHOD.DEMO : METHOD_BY_ACCOUNT[account.type] ?? LOGIN_METHOD.LEGACY,
    email: account.email ?? null,
    emailVerified: Boolean(account.emailVerified),
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
 * start screen shows.
 *
 * Everyone signs in with an email account (Log in, or Create account: a new
 * account is a citizen at once) or with the labelled demo login. There is no
 * anonymous sign-in. Nothing signs in before consent on the start screen.
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

  /** Hands a Firebase account to the API (or to the local session). Returns the app user. */
  const signInWith = async (account) => {
    if (useApi) {
      const { user: u } = await getSessionClient().loginFirebase(account.idToken);
      return toAppUser(u); // the client's onChange (above) has applied it
    }
    const session = startEmailSession({
      uid: account.uid,
      email: account.email,
      emailVerified: account.emailVerified,
      name: user?.id === account.uid ? user.name : undefined,
    });
    if (userIdRef.current !== session.id) startFresh();
    userIdRef.current = session.id;
    setUser(session);
    return session;
  };

  /** Demo login ("Try the demo"). Returns the new user (a Promise in API mode). */
  const login = (role, name) => {
    if (useApi) {
      try {
        requireDeviceConsent();
      } catch (err) {
        return Promise.reject(err);
      }
    } else requireDeviceConsent();
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

  /**
   * "Log in". The role comes from the server: a citizen, unless an official
   * or worker role was granted to this verified email.
   */
  const logInWithEmail = async ({ email, password }) => {
    requireDeviceConsent();
    const account = await authService.logIn({ email, password });
    setNotice("");
    return signInWith(account);
  };

  /** "Create account": a citizen at once; the verification email is sent. */
  const createAccount = async ({ email, password }) => {
    requireDeviceConsent();
    const account = await authService.createAccount({ email, password });
    setNotice("");
    const signedIn = await signInWith(account);
    return { user: signedIn, verificationSent: account.verificationSent };
  };

  /** "Forgot password?": resolves the same whether or not the email has an account. */
  const resetPassword = (email) => authService.sendPasswordReset(email);

  /** After the verification email's link was clicked: picks up "verified". */
  const refreshAccount = async () => {
    const account = await authService.refreshAccount();
    await signInWith(account);
    if (!useApi) {
      const next = updateSession({ emailVerified: account.emailVerified });
      if (next) setUser(next);
    }
    return account.emailVerified;
  };

  const resendVerification = () => authService.resendVerification();

  /** Profile, "Change password". */
  const changePassword = ({ current, next }) => authService.changePassword({ current, next });

  /** The name shown on the profile (optional). */
  const updateName = async (name) => {
    if (useApi) {
      const { profile } = await getSessionClient().request("/api/profile", { method: "PATCH", body: { name } });
      setUser((u) => (u ? { ...u, name: profile?.name ?? name } : u));
      return;
    }
    const next = updateSession({ name });
    if (next) setUser(next);
  };

  /**
   * Signs out. `notice` is shown on the start screen (e.g. after withdrawing
   * consent). This device forgets its consent too, so the next person here is
   * asked again.
   */
  const resetAuth = ({ notice: message = "" } = {}) => {
    if (user && user.method !== LOGIN_METHOD.DEMO) authService.signOutUser(); // never rejects
    if (useApi) getSessionClient().logout();
    else clearSession();
    markSignedOut();
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
    logInWithEmail,
    createAccount,
    resetPassword,
    refreshAccount,
    resendVerification,
    changePassword,
    updateName,
    resetAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
