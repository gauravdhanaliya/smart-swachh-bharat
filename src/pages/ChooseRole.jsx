import { useCallback, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import CityIllustration from "../components/CityIllustration";
import DemoLoginSheet from "../components/DemoLoginSheet";
import LoginBackdrop from "../components/LoginBackdrop";
import PhoneOtpLogin from "../components/PhoneOtpLogin";
import SessionLoading from "../components/SessionLoading";
import { useAuth } from "../context/AuthContext";
import { useDemoLoginEnabled } from "../hooks/useDemoLoginEnabled";
import { ROLE_HOME } from "../services/authSession";

const LOGIN_TAGLINE = "Report it. Track it. Keep it clean.";
const PROTOTYPE_NOTICE = "Hackathon prototype — not an official government service";

const QUIET_LINK =
  "inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-sm font-semibold text-brand-green-700 underline decoration-emerald-300 underline-offset-4 hover:bg-emerald-50 hover:decoration-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";

// What a failed demo login means, in words a presenter can act on.
function demoErrorMessage(err) {
  if (err?.status === 404) return "Demo login is switched off on this server. Use phone login instead.";
  if (err?.status === 429) return "Too many demo logins. Please wait a minute and try again.";
  return err?.message || "Couldn't sign in. Please try again.";
}

/**
 * The login screen, sized to fit one phone screen (360x740 and up) without
 * scrolling: compact header, one card with the phone login (phone step, then
 * the OTP step in its place), and a small "Try the demo" link that opens the
 * demo roles in a bottom sheet — only where the demo login is switched on.
 */
export default function ChooseRole() {
  const navigate = useNavigate();
  const { role, isAuthenticated, status, notice, usesApi, login, loginWithOtp } = useAuth();
  const demoEnabled = useDemoLoginEnabled(usesApi);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [demoBusy, setDemoBusy] = useState(null); // role being signed in
  const demoBusyRef = useRef(null);

  const closeSheet = useCallback(() => {
    if (demoBusyRef.current) return; // a sign-in is on its way
    setSheetOpen(false);
    setDemoError("");
  }, []);

  if (status === "loading") return <SessionLoading />;
  if (isAuthenticated) return <Navigate to={ROLE_HOME[role]} replace />;

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

  // May reject (API mode); PhoneOtpLogin shows the reason.
  const handleVerified = async ({ uid, phone, idToken }) => {
    const session = await loginWithOtp({ uid, phone, idToken });
    navigate(ROLE_HOME[session.role], { replace: true });
  };

  return (
    <div className="min-h-dvh bg-emerald-50/40 sm:py-4">
      <div className="device-frame device-frame--app isolate">
        <LoginBackdrop />
        {/* Fits 360x740 without scrolling; scrolls only on smaller or zoomed screens. */}
        <div inert={sheetOpen || undefined} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Header, card and demo link as one block, centred in the space above the skyline
              (auto margins: if the screen is too short it starts at the top instead of being cut off).
              The block reserves the height of its tallest state (the OTP step with a two-line error,
              measured at 360px wide), so the header stays put between steps and only the card
              content changes. npm run test:layout checks the header position and that this
              reserve still matches the tallest state. */}
          <div className="flex flex-1 flex-col px-4 py-5">
            <div data-login-block className="my-auto min-h-[448px]">
              <header>
                <BrandLogo size="sm" subtitle={LOGIN_TAGLINE} />
              </header>

              <main className="mt-6">
                {notice && (
                  <p role="alert" className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                    {notice}
                  </p>
                )}

                <section aria-labelledby="login-title" className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-[0_8px_30px_-16px_rgba(15,110,58,0.35)]">
                  <h2 id="login-title" className="mb-4 text-2xl font-bold tracking-tight text-emerald-950">
                    Log in to continue
                  </h2>
                  <PhoneOtpLogin onVerified={handleVerified} />
                </section>

                {/* Same height while the server is asked, so nothing jumps when the link appears. */}
                <div className="mt-2 flex min-h-11 justify-center">
                  {demoEnabled && (
                    <button type="button" onClick={() => setSheetOpen(true)} className={QUIET_LINK}>
                      Try the demo
                    </button>
                  )}
                </div>
              </main>
            </div>
          </div>

          {/* Anchored just above the footer. Up to 112px tall; on a short screen it shrinks
              (scaled, never cut off) before the page would scroll. */}
          <div className="flex h-28 min-h-0 shrink flex-col justify-end" aria-hidden="true">
            <CityIllustration variant="skyline" className="block h-full min-h-0 w-full opacity-80" />
          </div>

          <footer className="flex flex-col items-center px-4 pb-4 text-center">
            <Link to="/privacy" className={QUIET_LINK}>
              Privacy notice
            </Link>
            <p className="text-xs font-medium text-balance text-brand-green-800">{PROTOTYPE_NOTICE}</p>
          </footer>
        </div>
      </div>

      {demoEnabled && (
        <DemoLoginSheet open={sheetOpen} onClose={closeSheet} onPick={pickDemoRole} busyRole={demoBusy} error={demoError} />
      )}
    </div>
  );
}
