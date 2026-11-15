import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LOGIN_METHOD, ROLE_HOME } from "../services/authSession";
import { resetDemoConsent } from "../services/consentService";

const LINK_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none";

/**
 * "Privacy and data" in every profile: the privacy notice, withdraw consent
 * (data kept) and delete my data (data removed), kept visually apart so they
 * can't be confused. Demo accounts can't be deleted; they get a presentation
 * helper that shows the consent screen again.
 */
export default function PrivacySettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const headingId = useId();
  const [resetState, setResetState] = useState({ busy: false, error: "" });
  const demo = user?.method === LOGIN_METHOD.DEMO;

  const resetConsent = async () => {
    setResetState({ busy: true, error: "" });
    try {
      await resetDemoConsent();
      navigate(ROLE_HOME[user.role] ?? "/", { replace: true }); // the consent screen shows there
    } catch (err) {
      setResetState({
        busy: false,
        error: err?.status === 404 ? "This is turned off on this server (demo login isn't enabled)." : err?.message || "Couldn't reset. Please try again.",
      });
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">
        Privacy and data
      </h2>

      <Link to="/privacy" className={`${LINK_BUTTON} justify-start rounded-2xl border border-emerald-100 bg-white text-emerald-900`}>
        View the privacy notice
      </Link>

      <div className="rounded-2xl border border-emerald-100 bg-white p-4">
        <p className="text-sm font-semibold text-emerald-950">Withdraw consent</p>
        <p className="mt-1 text-xs text-emerald-800/75">
          Signs you out everywhere and stops new collection. Your data is kept; sign in and agree again to come back.
        </p>
        <Link to="/account/withdraw" className={`${LINK_BUTTON} mt-3 border border-emerald-300 bg-white text-emerald-800`}>
          Withdraw consent
        </Link>
      </div>

      <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
        <p className="text-sm font-semibold text-red-900">Delete my data</p>
        {demo ? (
          <p className="mt-1 text-xs text-red-900/75">Demo accounts are shared by everyone trying the app, so they can&apos;t be deleted.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-red-900/75">
              Permanently deletes your account and personal data, including your sign-in. Complaints are kept anonymised. Can&apos;t be undone.
            </p>
            <Link to="/account/delete" className={`${LINK_BUTTON} mt-3 border border-red-300 bg-white text-red-700`}>
              Delete my data
            </Link>
          </>
        )}
      </div>

      {demo && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-amber-950">For presentations</p>
          <p className="mt-1 text-xs text-amber-900/80">
            Clears the demo accounts&apos; agreement so the consent screen shows again. Only demo accounts can do this.
          </p>
          <button
            type="button"
            onClick={resetConsent}
            disabled={resetState.busy}
            className={`${LINK_BUTTON} mt-3 border border-amber-300 bg-white text-amber-900 btn-disabled-quiet`}
          >
            {resetState.busy ? "Resetting…" : "Reset demo consent"}
          </button>
          {resetState.error && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-700">
              {resetState.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
