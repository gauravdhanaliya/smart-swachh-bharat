import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";

export default function Success() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/mobile", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  return (
    <ScreenShell>
      <div className="flex flex-1 flex-col items-center justify-center text-center animate-fade-in-up">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600 shadow-lg shadow-emerald-900/20">
          <svg viewBox="0 0 24 24" className="h-12 w-12 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>

        <h2 className="mt-6 text-2xl font-bold text-emerald-950">
          Login Successful!
        </h2>
        <p className="mt-1 text-sm text-emerald-800/70">
          Welcome back to EcoSetu
        </p>
      </div>

      <PrimaryButton
        onClick={() => {
          // Step 3 — every role now has a working dashboard.
          const destinations = { citizen: "/citizen", official: "/official", worker: "/worker" };
          navigate(destinations[role] ?? "/");
        }}
      >
        Continue
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </PrimaryButton>
    </ScreenShell>
  );
}
