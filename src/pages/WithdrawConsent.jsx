import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import SessionLoading from "../components/SessionLoading";
import { useAuth } from "../context/AuthContext";
import { LOGIN_METHOD } from "../services/authSession";
import { withdrawConsent } from "../services/consentService";

const WITHDRAWN_NOTICE = "You withdrew your consent and were signed out. Your data is kept; sign in and agree again to continue.";

/** Withdraw consent: signs out and stops new collection. The data is KEPT (unlike Delete my data). */
export default function WithdrawConsent() {
  const { user, status, resetAuth } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (status === "loading") return <SessionLoading />;
  if (!user) return <Navigate to="/login" replace />;

  const withdraw = async () => {
    setBusy(true);
    setError("");
    try {
      await withdrawConsent();
      resetAuth({ notice: WITHDRAWN_NOTICE });
      navigate("/login", { replace: true });
    } catch (err) {
      setBusy(false);
      setError(err?.message || "Couldn't withdraw your consent. Please try again.");
    }
  };

  return (
    <ScreenShell showBack>
      <h1 className="mt-2 text-2xl font-bold text-emerald-950">Withdraw consent</h1>
      <p role="note" className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <strong>This screen withdraws your consent.</strong> Your data is kept. It does not delete anything.
      </p>

      <div className="mt-4 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-emerald-950">What happens</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-emerald-900/85">
          <li>You are signed out on every device straight away.</li>
          <li>EcoSetu stops collecting new data about you.</li>
          <li>Your account, complaints and ratings are kept as they are.</li>
          <li>To use EcoSetu again, sign in and agree to the privacy notice again.</li>
        </ul>
      </div>

      {user.method !== LOGIN_METHOD.DEMO && (
        <p className="mt-3 text-sm text-emerald-900/80">
          Want your data removed?{" "}
          <Link to="/account/delete" className="font-semibold text-red-700 underline">
            Delete my data instead
          </Link>
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="mt-6 mb-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={withdraw}
          disabled={busy}
          className="min-h-12 cursor-pointer rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-800 btn-disabled"
        >
          {busy ? "Withdrawing…" : "Withdraw and sign out"}
        </button>
        <button type="button" onClick={() => navigate(-1)} className="min-h-11 rounded-full px-5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
          Cancel
        </button>
      </div>
    </ScreenShell>
  );
}
