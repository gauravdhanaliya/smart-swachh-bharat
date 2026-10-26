import { useState } from "react";
import { useNavigate } from "react-router-dom";
import GovShell from "../../components/GovShell";
import ConfirmDialog from "../../components/ConfirmDialog";
import ResetAllDataButton from "../../components/ResetAllDataButton";
import { useAuth } from "../../context/AuthContext";
import { useGovProfile, govInitials } from "../../hooks/useGovProfile";

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value || "—"}</p>
    </div>
  );
}

export default function GovProfile() {
  const { resetAuth } = useAuth();
  const navigate = useNavigate();
  const { profile } = useGovProfile();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const handleLogout = () => {
    resetAuth();
    navigate("/login", { replace: true });
  };

  return (
    <GovShell title="Profile" subtitle="Government Official account">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-xl font-bold text-sky-700">
            {govInitials(profile.name)}
          </span>
          <p className="mt-3 text-lg font-bold text-slate-900">{profile.name}</p>
          <p className="text-sm text-slate-500">
            {[profile.designation, profile.department].filter(Boolean).join(" · ") || "Government Official"}
          </p>

          <button
            type="button"
            onClick={() => navigate("/profile/setup", { state: { edit: true } })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            Edit details
          </button>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-left">
            <Detail label="Role" value="Government Official" />
            <Detail label="City" value={profile.cityName} />
            <Detail label="State" value={profile.state} />
            <Detail label="Mobile" value={profile.mobile ? `+91 ${profile.mobile}` : ""} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setConfirmingLogout(true)}
          className="mt-5 w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
        >
          Logout
        </button>
        <ResetAllDataButton className="mt-3" />
      </div>

      <ConfirmDialog
        open={confirmingLogout}
        title="Log out of EcoSetu?"
        message="You can sign back in any time by choosing Government Official on the login page."
        confirmLabel="Log out"
        danger
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={handleLogout}
      />
    </GovShell>
  );
}
