import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SessionLoading from "./SessionLoading";
import { ROLE_HOME } from "../services/authSession";
import ConsentGate from "./ConsentGate";

/**
 * Keeps each role on its own screens. A signed-out visitor goes to the login
 * page; a signed-in user on another role's page goes to their own home. In API
 * mode the role comes from the server, and nothing is decided until the
 * session has been restored (a loading screen, never a blank one). Then the
 * account must have agreed to the current privacy notice (ConsentGate).
 */
export default function RequireRole({ role, children }) {
  const { role: currentRole, isAuthenticated, status } = useAuth();

  if (status === "loading") return <SessionLoading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (currentRole !== role) return <Navigate to={ROLE_HOME[currentRole] ?? "/login"} replace />;

  return <ConsentGate>{children}</ConsentGate>;
}
