import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

const STORAGE_KEY = "ssb_auth_state";

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed storage and fall back to defaults
  }
  return { role: null, mobileNumber: "", isAuthenticated: false };
}

export function AuthProvider({ children }) {
  const [role, setRole] = useState(() => loadInitialState().role);
  const [mobileNumber, setMobileNumber] = useState(
    () => loadInitialState().mobileNumber
  );
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => loadInitialState().isAuthenticated
  );

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ role, mobileNumber, isAuthenticated })
    );
  }, [role, mobileNumber, isAuthenticated]);

  const selectRole = (selectedRole) => setRole(selectedRole);

  const completeLogin = (verifiedMobileNumber) => {
    setMobileNumber(verifiedMobileNumber);
    setIsAuthenticated(true);
  };

  const resetAuth = () => {
    setRole(null);
    setMobileNumber("");
    setIsAuthenticated(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const value = {
    role,
    mobileNumber,
    isAuthenticated,
    selectRole,
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
