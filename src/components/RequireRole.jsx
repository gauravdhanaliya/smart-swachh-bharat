import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Keeps a citizen from landing on Government/Worker screens (and vice
 * versa) through normal navigation. The role comes from the signed-in
 * Firebase user; the API enforces it again on every request.
 */
export default function RequireRole({ role, children }) {
  const { role: currentRole, isAuthenticated, loading } = useAuth();

  // Firebase is still restoring the session after a refresh.
  if (loading) return null;

  if (!isAuthenticated || currentRole !== role) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
