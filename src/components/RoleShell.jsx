import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const THEME = {
  official: { bg: "bg-sky-600", chip: "bg-sky-50 text-sky-700" },
  worker: { bg: "bg-orange-600", chip: "bg-orange-50 text-orange-700" },
};

/**
 * Minimal top-bar shell for the Government Official and Worker
 * dashboards added in Step 3. Reuses the same phone-frame treatment
 * (`device-frame`) as the Citizen/auth screens instead of a bottom
 * navigation bar, since only one or two screens exist per role so far.
 */
export default function RoleShell({
  role,
  title,
  roleLabel,
  showBack = false,
  onBack,
  children,
}) {
  const navigate = useNavigate();
  const { resetAuth } = useAuth();
  const theme = THEME[role] ?? THEME.official;

  const handleLogout = () => {
    resetAuth();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-emerald-50/40 sm:py-6">
      <div className="device-frame">
        <div className={`${theme.bg} px-5 pb-4 pt-5 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showBack && (
                <button
                  type="button"
                  onClick={onBack ?? (() => navigate(-1))}
                  aria-label="Go back"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
              )}
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${theme.chip}`}>
                {roleLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
          <h1 className="mt-3 text-lg font-bold">{title}</h1>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
