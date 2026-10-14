import { createContext, useContext, useEffect, useState } from "react";
import { logoutFromApi, refreshSession, setSessionLostHandler, setSessionRole } from "../services/api";
import { signOutFirebase } from "../services/firebase";
import { resetStore } from "../services/locationStore";

const AuthContext = createContext(null);

// Session = the server's access token (held in memory by services/api.js)
// plus its refresh token in an httpOnly cookie. Firebase only proves the
// phone number at sign-in. On a page load the cookie is exchanged for a fresh
// access token, which is also how the user's role is restored.
export function AuthProvider({ children }) {
  const [session, setSession] = useState({ role: null, mobileNumber: "" });
  const [loading, setLoading] = useState(true);

  const apply = (user) => {
    const next = { role: user?.role ?? null, mobileNumber: user?.mobile ?? "" };
    setSessionRole(next.role);
    setSession(next);
  };

  // Clear leftovers of earlier session storage (old demo / Firebase-only builds).
  useEffect(() => {
    try {
      ["ssb_auth_state", "ssb_api_token_v1", "ssb_api_role_v1"].forEach((k) => localStorage.removeItem(k));
    } catch {
      // storage blocked — nothing to clean
    }
  }, []);

  // Restore the session on load, and sign out if a refresh ever fails later.
  useEffect(() => {
    let live = true;
    refreshSession().then((result) => {
      if (!live) return;
      apply(result?.user ?? null);
      setLoading(false);
    });
    setSessionLostHandler(() => {
      apply(null);
      resetStore();
      signOutFirebase();
    });
    return () => {
      live = false;
      setSessionLostHandler(() => {});
    };
  }, []);

  /** Called right after POST /auth/firebase-login succeeds, with the user it returned. */
  const completeLogin = (user) => {
    apply(user);
    setLoading(false);
  };

  const resetAuth = () => {
    apply(null);
    resetStore();
    logoutFromApi(); // revokes the refresh token and clears the cookie
    signOutFirebase();
  };

  const isAuthenticated = Boolean(session.role);

  const value = {
    // The role the server holds for this account (null when signed out).
    role: session.role,
    mobileNumber: session.mobileNumber,
    isAuthenticated,
    loading,
    completeLogin,
    resetAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
