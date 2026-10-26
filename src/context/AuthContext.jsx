import { createContext, useContext, useEffect, useState } from "react";
import {
  clearLegacySessions,
  clearSession,
  isSessionKey,
  readSession,
  startSession,
} from "../services/authSession";
import { resetStore } from "../services/locationStore";
import { clearAllData } from "../services/dataReset";
import { notifyProfilesChanged } from "../services/profileService";
import { notifyComplaintsChanged } from "../services/complaintService";

const AuthContext = createContext(null);

// The signed-in demo user ({ id, name, role, loginAt }) from services/authSession.js.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession);

  useEffect(() => {
    clearLegacySessions();
  }, []);

  // Signing in or out in another tab applies here too.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === null || isSessionKey(e.key)) setUser(readSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** Signs in as `role` straight away. Returns the new session. */
  const login = (role, name) => {
    const session = startSession(role, name);
    resetStore();
    setUser(session);
    return session;
  };

  const resetAuth = () => {
    clearSession();
    resetStore();
    setUser(null);
  };

  /** "Reset all data": wipes every EcoSetu key and profile, then signs out. */
  const resetAllData = () => {
    clearAllData();
    resetStore();
    notifyProfilesChanged();
    notifyComplaintsChanged();
    setUser(null);
  };

  const value = {
    user,
    role: user?.role ?? null,
    isAuthenticated: Boolean(user),
    login,
    resetAuth,
    resetAllData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
