import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Keeps a citizen from landing on Government/Worker screens (and vice
 * versa) through normal navigation. The role comes from the local demo
 * session (services/authSession.js) — a demo guard, not security.
 */
export default function RequireRole({ role, children }) {
  const { role: currentRole, isAuthenticated } = useAuth();

  if (!isAuthenticated || currentRole !== role) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
