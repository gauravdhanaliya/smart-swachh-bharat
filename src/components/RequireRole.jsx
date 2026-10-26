import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../hooks/useProfile";

/**
 * Keeps a citizen from landing on Government/Worker screens (and vice
 * versa) through normal navigation, and sends a signed-in user who hasn't
 * filled in their profile yet to the setup screen first. The role comes
 * from the local session (services/authSession.js) — a guard, not security.
 */
export default function RequireRole({ role, children }) {
  const { role: currentRole, isAuthenticated } = useAuth();
  const profile = useProfile(role);

  if (!isAuthenticated || currentRole !== role) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <Navigate to="/profile/setup" replace />;
  }

  return children;
}
