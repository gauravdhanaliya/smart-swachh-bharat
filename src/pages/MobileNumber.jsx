import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";

export default function MobileNumber() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
    setMobile(digitsOnly);
    if (error) setError("");
  };

  const handleSendOtp = (e) => {
    e.preventDefault();
    if (mobile.length === 0) {
      setError("Please enter your mobile number.");
      return;
    }
    if (mobile.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    navigate("/otp", { state: { mobile } });
  };

  return (
    <ScreenShell showBack onBack={() => navigate("/login")}>
      <h2 className="mt-6 text-2xl font-bold text-emerald-950">
        Login with Mobile Number
      </h2>
      <p className="mt-1 text-sm text-emerald-800/70">
        Enter your mobile number to receive an OTP
      </p>

      {role && (
        <p className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          Signing in as {ROLE_LABEL[role] ?? role}
        </p>
      )}

      <form onSubmit={handleSendOtp} className="mt-6 flex flex-col gap-4">
        <div>
          <div
            className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 ${
              error ? "border-red-400" : "border-emerald-200"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span className="font-medium text-emerald-900">+91</span>
            <span className="h-5 w-px bg-emerald-200" />
            <input
              type="tel"
              inputMode="numeric"
              placeholder="Mobile Number"
              value={mobile}
              onChange={handleChange}
              className="flex-1 bg-transparent text-emerald-950 placeholder:text-emerald-800/40 outline-none"
            />
          </div>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </div>

        <PrimaryButton type="submit">
          Send OTP
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </PrimaryButton>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs font-medium text-emerald-800/40">
        <span className="h-px flex-1 bg-emerald-100" />
        OR
        <span className="h-px flex-1 bg-emerald-100" />
      </div>

      <button
        type="button"
        onClick={() => {
          // Demo-only: password login is not implemented in Step 1.
          setError("Password login isn't available in this demo yet.");
        }}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-6 py-3.5 text-base font-semibold text-emerald-800 hover:bg-emerald-50"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        Login with Password
      </button>
    </ScreenShell>
  );
}

const ROLE_LABEL = {
  citizen: "Citizen",
  official: "Government Official",
  worker: "Worker",
};
