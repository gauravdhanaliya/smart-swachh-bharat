import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SessionLoading from "./SessionLoading";
import { ROLE_HOME } from "../services/authSession";
import ConsentGate from "./ConsentGate";

/**
 * Keeps each role on its own screens. A signed-in user on another role's page
 * goes to their own home. In API mode the role comes from the server, and
 * nothing is decided until the session has been restored (a loading screen,
 * never a blank one). Then the account must have agreed to the current
 * privacy notice (ConsentGate). Signed out, every page goes to the start
 * screen (/login): consent first, then log in or create an account.
 */
export default function RequireRole({ role, children }) {
  const { role: currentRole, isAuthenticated, status } = useAuth();

  if (status === "loading") return <SessionLoading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (currentRole !== role) return <Navigate to={ROLE_HOME[currentRole] ?? "/login"} replace />;

  return <ConsentGate>{children}</ConsentGate>;
}

/** "/": your home if signed in, otherwise the start screen. */
export function HomeRedirect() {
  const { role, isAuthenticated, status } = useAuth();
  if (status === "loading") return <SessionLoading />;
  return <Navigate to={isAuthenticated ? ROLE_HOME[role] ?? "/login" : "/login"} replace />;
}
