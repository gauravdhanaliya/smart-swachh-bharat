import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import TaglineStrip from "../components/TaglineStrip";
import RoleCard from "../components/RoleCard";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";

const ROLES = [
  {
    id: "citizen",
    title: "Citizen",
    description: "Report issues, track complaints, find nearby bins and more.",
  },
  {
    id: "official",
    title: "Government Official",
    description: "Monitor city-wide data, manage operations, track performance.",
  },
  {
    id: "worker",
    title: "Worker",
    description: "View assigned tasks, update collection status, report issues.",
  },
];

export default function ChooseRole() {
  const navigate = useNavigate();
  const { role, selectRole } = useAuth();
  const [selected, setSelected] = useState(role ?? null);

  const handleContinue = () => {
    if (!selected) return;
    selectRole(selected);
    navigate("/mobile");
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
        Login to continue to your account
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {ROLES.map((r) => (
          <RoleCard
            key={r.id}
            id={r.id}
            title={r.title}
            description={r.description}
            selected={selected === r.id}
            onSelect={setSelected}
          />
        ))}
      </div>

      <PrimaryButton onClick={handleContinue} disabled={!selected} className="mt-6">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
        Continue with Mobile Number
      </PrimaryButton>

      <p className="mt-6 mx-auto w-fit rounded-2xl bg-white/80 px-4 py-1.5 text-center font-semibold text-emerald-950 shadow-sm backdrop-blur-sm">
        A Cleaner India
        <br />
        Starts with You
      </p>
    </ScreenShell>
  );
}
