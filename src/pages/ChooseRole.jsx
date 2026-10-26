import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import TaglineStrip from "../components/TaglineStrip";
import RoleCard from "../components/RoleCard";
import { useAuth } from "../context/AuthContext";
import { ROLE_HOME } from "../services/authSession";

const ROLES = [
  { id: "citizen", title: "Citizen", description: "Report issues and track complaints" },
  { id: "worker", title: "Sanitation Worker", description: "View assigned tasks and request facilities" },
  { id: "official", title: "Government Official", description: "Monitor, approve and manage facilities" },
];

// Open demo sign-in: tapping a role signs in as that role's demo user.
export default function ChooseRole() {
  const navigate = useNavigate();
  const { role, isAuthenticated, login } = useAuth();
  const [name, setName] = useState("");

  if (isAuthenticated) return <Navigate to={ROLE_HOME[role]} replace />;

  const handleSelect = (selected) => {
    login(selected, name);
    navigate(ROLE_HOME[selected], { replace: true });
  };

  return (
    <ScreenShell>
      <div className="mt-2 text-center">
        <TaglineStrip />
        <p className="mt-1.5 text-xs font-medium text-emerald-800/50">
          Connecting Citizens, Government &amp; Sanitation Workers
        </p>
      </div>

      <h2 className="mt-6 text-center text-2xl font-bold text-emerald-950">
        Welcome Back!
      </h2>
      <p className="mt-1 text-center text-sm text-emerald-800/70">
        Choose your role to continue
      </p>

      <div className="mt-6">
        <label htmlFor="login-name" className="text-sm font-semibold text-emerald-950">
          Your name
        </label>
        <input
          id="login-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          autoComplete="name"
          maxLength={60}
          className="mt-1.5 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-emerald-950 placeholder:text-emerald-800/40 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {ROLES.map((r) => (
          <RoleCard key={r.id} id={r.id} title={r.title} description={r.description} onSelect={handleSelect} />
        ))}
      </div>

      <p className="mt-6 mx-auto w-fit rounded-2xl bg-white/80 px-4 py-1.5 text-center font-semibold text-emerald-950 shadow-sm backdrop-blur-sm">
        A Cleaner India
        <br />
        Starts with You
      </p>
    </ScreenShell>
  );
}
