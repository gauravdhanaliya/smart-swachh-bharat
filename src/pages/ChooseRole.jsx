import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import TaglineStrip from "../components/TaglineStrip";
import PrimaryButton from "../components/PrimaryButton";

// Everyone signs in the same way. Which dashboard opens afterwards depends on
// the role the server holds for the account — it can't be picked here, so
// nobody can sign in as a worker or government official by choosing to.
export default function ChooseRole() {
  const navigate = useNavigate();

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

      <div className="mt-6 rounded-2xl border border-emerald-100 bg-white p-4 text-sm text-emerald-900/80">
        <p>
          Sign in with your mobile number. New accounts start as <b>Citizen</b>.
        </p>
        <p className="mt-2">
          Government officials and sanitation workers: your administrator sets up your role on
          your number, and your own dashboard opens after you sign in.
        </p>
      </div>

      <PrimaryButton onClick={() => navigate("/mobile")} className="mt-6">
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
