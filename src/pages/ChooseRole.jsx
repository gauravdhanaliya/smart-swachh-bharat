import { useCallback, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import BrandLogo from "../components/BrandLogo";
import { ConsentForm } from "../components/ConsentGate";
import DemoLoginSheet from "../components/DemoLoginSheet";
import EmailLoginCard from "../components/EmailLoginCard";
import SessionLoading from "../components/SessionLoading";
import { useAuth } from "../context/AuthContext";
import { useDemoLoginEnabled } from "../hooks/useDemoLoginEnabled";
import { ROLE_HOME } from "../services/authSession";
import { deviceConsent, saveDeviceConsent } from "../services/consentService";
import { DEFAULT_CONSENT_VERSION } from "../../server/src/constants.js";
import { SECONDARY } from "../components/accountFormStyles";
import { step } from "../utils/motion";

const LOGIN_TAGLINE = "Report it. Track it. Keep it clean.";
const PROTOTYPE_NOTICE = "Hackathon prototype, not an official government service";

/** One small grey line: the privacy notice link and what this is. */
function PageFooter() {
  return (
    <footer data-page-footer className="shrink-0 border-t border-line px-4 py-3 text-center text-xs leading-4 text-muted">
      {/* Inline, so its padding gives a 44px tap area without stretching the line. */}
      <Link to="/privacy" className="py-[15px] font-semibold text-brand hover:text-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
        Privacy notice
      </Link>
      <span aria-hidden="true"> · </span>
      <span>{PROTOTYPE_NOTICE}</span>
    </footer>
  );
}

// What a failed demo login means, in words a presenter can act on.
function demoErrorMessage(err) {
  if (err?.status === 404) return "Demo login is switched off on this server.";
  if (err?.status === 429) return "Too many demo logins. Please wait a minute and try again.";
  return err?.message || "Couldn't sign in. Please try again.";
}

/**
 * The start screen, shown on a first visit and after a logout.
 *
 * 1. Consent: nothing is created (no Firebase account, no request to the
 *    API) until the user has agreed. The agreement is kept on this device and
 *    recorded for the account once it exists (ConsentGate).
 * 2. The card is the email login itself: Log in, Forgot password?, Create
 *    account (a new account is a citizen at once). For citizens, officials
 *    and workers alike; the role comes from the server. "Try the demo" is
 *    an outlined button inside the card (only where the demo login is on).
 *
 * Clean white: logo, name and tagline at the top, a white form card, and one
 * grey footer line. No decoration.
 *
 * Sized to fit one phone screen (360x740 and up) without scrolling.
 */
export default function ChooseRole() {
  const { status, notice } = useAuth();
  const [consented, setConsented] = useState(() => Boolean(deviceConsent()));
  const reduced = useReducedMotion();

  if (status === "loading") return <SessionLoading />;

  return (
    <div className="min-h-dvh bg-section sm:py-4">
      <div className="device-frame device-frame--app isolate">
        <AnimatePresence mode="wait" initial={false}>
          {consented ? (
            <motion.div key="start" {...step(reduced, 1)} className="flex min-h-0 flex-1 flex-col">
              <StartOptions />
            </motion.div>
          ) : (
            <motion.div key="consent" {...step(reduced, -1)} className="flex min-h-0 flex-1 flex-col">
              <ConsentStep
                notice={notice}
                onAgree={(items) => {
                  saveDeviceConsent({ version: DEFAULT_CONSENT_VERSION, items });
                  setConsented(Boolean(deviceConsent()));
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ConsentStep({ notice, onAgree }) {
  const [error, setError] = useState("");
  return (
    <div data-consent-step className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex-1 px-4 py-6">
      <header className="mb-6">
        <BrandLogo size="sm" subtitle={LOGIN_TAGLINE} />
      </header>
      {notice && (
        <p role="alert" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {notice}
        </p>
      )}
      <main>
        <ConsentForm
          headingLevel={1}
          error={error}
          onAgree={(items) => {
            onAgree(items);
            // Storage blocked: the agreement couldn't be kept, so we can't go on.
            if (!deviceConsent()) setError("This browser is blocking storage, so your agreement couldn't be saved. Allow site data and try again.");
          }}
        />
      </main>
      </div>
      <PageFooter />
    </div>
  );
}

function StartOptions() {
  const navigate = useNavigate();
  const { role, isAuthenticated, notice, usesApi, login } = useAuth();
  const demoEnabled = useDemoLoginEnabled(usesApi);
  const [signingIn, setSigningIn] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [demoBusy, setDemoBusy] = useState(null); // role being signed in
  const demoBusyRef = useRef(null);

  const closeDemo = useCallback(() => {
    if (demoBusyRef.current) return; // a sign-in is on its way
    setSheetOpen(false);
    setDemoError("");
  }, []);

  if (isAuthenticated && !signingIn && !demoBusy) return <Navigate to={ROLE_HOME[role]} replace />;

  const pickDemoRole = async (selected) => {
    if (demoBusyRef.current) return;
    setDemoError("");
    demoBusyRef.current = selected;
    setDemoBusy(selected);
    try {
      const session = await login(selected);
      navigate(ROLE_HOME[session.role], { replace: true });
    } catch (err) {
      setDemoError(demoErrorMessage(err));
      demoBusyRef.current = null;
      setDemoBusy(null);
    }
  };

  return (
    <>
      {/* Fits 360x740 without scrolling; scrolls only on smaller or zoomed screens. */}
      <div inert={sheetOpen || undefined} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Header and card as one block, centred in the space above the footer
            (auto margins: if the screen is too short it starts at the top instead of being cut off).
            The block reserves the height of its tallest state (the log-in view with an error under
            each field), so the header stays put when errors appear or the card switches views.
            npm run test:layout checks the header position and that this reserve still matches. */}
        <div className="flex flex-1 flex-col px-4 py-6">
          <div data-login-block className="my-auto min-h-[538px]">
            <header>
              <BrandLogo size="sm" subtitle={LOGIN_TAGLINE} />
            </header>

            <main className="mt-6">
              {notice && (
                <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                  {notice}
                </p>
              )}

              <EmailLoginCard
                onBusyChange={setSigningIn}
                onSignedIn={(user) => navigate(ROLE_HOME[user?.role] ?? ROLE_HOME.citizen, { replace: true })}
                footer={
                  // Same height while the server is asked, so nothing jumps when the button appears.
                  <div className="mt-4 min-h-12">
                    {demoEnabled && (
                      <button type="button" onClick={() => setSheetOpen(true)} className={SECONDARY}>
                        Try the demo
                      </button>
                    )}
                  </div>
                }
              />
            </main>
          </div>
        </div>

        <PageFooter />
      </div>

      {demoEnabled && (
        <DemoLoginSheet open={sheetOpen} onClose={closeDemo} onPick={pickDemoRole} busyRole={demoBusy} error={demoError} roles={["citizen", "worker", "official"]} />
      )}
    </>
  );
}
