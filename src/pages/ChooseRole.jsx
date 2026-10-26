import { Navigate, useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import TaglineStrip from "../components/TaglineStrip";
import RoleCard from "../components/RoleCard";
import { useAuth } from "../context/AuthContext";
import { ROLE_HOME } from "../services/authSession";
import { hasProfile } from "../services/profileService";

const ROLES = [
  { id: "citizen", title: "Citizen", description: "Report issues and track complaints" },
  { id: "worker", title: "Sanitation Worker", description: "View assigned tasks and request facilities" },
  { id: "official", title: "Government Official", description: "Monitor, approve and manage facilities" },
];

// First login for a role opens profile setup; after that, its dashboard.
const destination = (role) => (hasProfile(role) ? ROLE_HOME[role] : "/profile/setup");

// Open sign-in: tapping a role signs in as that role straight away.
export default function ChooseRole() {
  const navigate = useNavigate();
  const { role, isAuthenticated, login } = useAuth();

  if (isAuthenticated) return <Navigate to={destination(role)} replace />;

  const handleSelect = (selected) => {
    login(selected);
    navigate(destination(selected), { replace: true });
  };

  return (
    <ScreenShell>
      <div className="text-center">
        <TaglineStrip />
        <p className="mt-1 text-xs font-medium text-emerald-800/50">
          Connecting Citizens, Government &amp; Sanitation Workers
        </p>
      </div>

      <h2 className="mt-3 text-center text-2xl font-bold text-emerald-950">
        Welcome Back!
      </h2>
      <p className="mt-0.5 text-center text-sm text-emerald-800/70">
        Choose your role to continue
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {ROLES.map((r) => (
          <RoleCard key={r.id} id={r.id} title={r.title} description={r.description} onSelect={handleSelect} />
        ))}
      </div>
    </ScreenShell>
  );
}
