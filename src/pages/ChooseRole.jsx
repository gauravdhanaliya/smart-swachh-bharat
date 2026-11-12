import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import TaglineStrip from "../components/TaglineStrip";
import RoleCard from "../components/RoleCard";
import PhoneOtpLogin from "../components/PhoneOtpLogin";
import SessionLoading from "../components/SessionLoading";
import { useAuth } from "../context/AuthContext";
import { ROLE_HOME } from "../services/authSession";

const ROLES = [
  { id: "citizen", title: "Citizen", description: "Report issues and track complaints" },
  { id: "worker", title: "Sanitation Worker", description: "View assigned tasks and request facilities" },
  { id: "official", title: "Government Official", description: "Monitor, approve and manage facilities" },
];

const SECTION = "rounded-3xl border border-emerald-100 bg-white/90 p-4 shadow-sm";

// What a failed demo login means, in words a presenter can act on.
function demoErrorMessage(err) {
  if (err?.status === 404) return "Demo login is switched off on this server. Use phone login instead.";
  if (err?.status === 429) return "Too many demo logins. Please wait a minute and try again.";
  return err?.message || "Couldn't sign in. Please try again.";
}

// Two ways in: a real phone OTP login (always a citizen), and the open demo
// sign-in where tapping a role signs in as that role's demo user.
export default function ChooseRole() {
  const navigate = useNavigate();
  const { role, isAuthenticated, status, notice, usesApi, login, loginWithOtp } = useAuth();
  const [name, setName] = useState("");
  const [demoError, setDemoError] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);

  if (status === "loading") return <SessionLoading />;
  if (isAuthenticated) return <Navigate to={ROLE_HOME[role]} replace />;

  const handleSelect = async (selected) => {
    if (demoBusy) return;
    setDemoError("");
    setDemoBusy(true);
    try {
      const session = await login(selected, name);
      navigate(ROLE_HOME[session.role], { replace: true });
    } catch (err) {
      setDemoError(demoErrorMessage(err));
      setDemoBusy(false);
    }
  };

  // May reject (API mode); PhoneOtpLogin shows the reason.
  const handleVerified = async ({ uid, phone, idToken }) => {
    const session = await loginWithOtp({ uid, phone, idToken });
    navigate(ROLE_HOME[session.role], { replace: true });
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
        Choose how you want to log in
      </p>

      {notice && (
        <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {notice}
        </p>
      )}

      <section aria-labelledby="otp-login-title" className={`mt-6 ${SECTION}`}>
        <h3 id="otp-login-title" className="text-base font-bold text-emerald-950">
          Login with phone (OTP)
        </h3>
        <p className="mt-0.5 mb-3 text-xs text-emerald-800/70">
          For citizens. We send a one-time code to your mobile number.
        </p>
        <PhoneOtpLogin onVerified={handleVerified} />
      </section>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-emerald-200" />
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800/50">or</span>
        <span className="h-px flex-1 bg-emerald-200" />
      </div>

      <section aria-labelledby="demo-login-title" className={`border-dashed border-amber-300 ${SECTION}`}>
        <div className="flex items-center gap-2">
          <h3 id="demo-login-title" className="text-base font-bold text-emerald-950">
            Demo login (pick a role)
          </h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
            Demo
          </span>
        </div>
        <p className="mt-0.5 text-xs text-emerald-800/70">
          For presentations. No phone number or password needed.
          {usesApi && " Each role signs in as the server's demo account."}
        </p>

        {/* The server's demo accounts have fixed names, so there is nothing to type in API mode. */}
        {!usesApi && (
          <div className="mt-3">
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
        )}

        {demoError && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
            {demoError}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {ROLES.map((r) => (
            <RoleCard key={r.id} id={r.id} title={r.title} description={r.description} onSelect={handleSelect} />
          ))}
        </div>
      </section>

      <p className="mt-4 text-center text-xs text-emerald-800/70">
        <Link to="/privacy" className="font-semibold text-emerald-700 underline">
          Privacy notice
        </Link>
      </p>

      <p className="mt-6 mx-auto w-fit rounded-2xl bg-white/80 px-4 py-1.5 text-center font-semibold text-emerald-950 shadow-sm backdrop-blur-sm">
        A Cleaner India
        <br />
        Starts with You
      </p>
    </ScreenShell>
  );
}
