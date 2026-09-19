import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Prototype RBAC — keeps a citizen from landing on Government/Worker
 * screens (and vice versa) through normal navigation. Not production
 * security, just a guard for the demo.
 */
export default function RequireRole({ role, children }) {
  const { role: currentRole, isAuthenticated } = useAuth();

  if (!isAuthenticated || currentRole !== role) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
