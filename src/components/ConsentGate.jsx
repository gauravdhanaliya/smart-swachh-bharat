import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import SessionLoading from "./SessionLoading";
import { useAuth } from "../context/AuthContext";
import { LOGIN_METHOD } from "../services/authSession";
import { acceptConsent, consentKnownAccepted, getConsentStatus, onConsentReset } from "../services/consentService";
import { fadeUp } from "../utils/motion";

const ITEMS = [
  { key: "phoneForLogin", label: "I agree to the use of my phone number for login (OTP).", phoneOnly: true },
  { key: "locationWhenReporting", label: "I allow location access when I report a complaint or request." },
  { key: "photosAttached", label: "I understand photos I upload are attached to my complaint." },
  { key: "readNotice", label: "I have read the Privacy Notice." },
];

const SUMMARY = [
  "Phone number: Firebase Authentication (Google), for login. EcoSetu keeps only a hash and a masked copy.",
  "Account, complaints, ratings: EcoSetu's database (MongoDB Atlas).",
  "Photos: private storage (Vercel Blob), never a public link.",
  "Complaint locations (rounded to about 11 m) and map searches: OpenStreetMap Nominatim, to look up addresses.",
];

/**
 * Shows the consent screen until the signed-in account has agreed to the
 * current privacy notice (one record per account, on the server). Used by
 * RequireRole, so every role's pages are covered.
 */
export default function ConsentGate({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(() => (consentKnownAccepted(user.id) ? { status: "ok" } : { status: "loading" }));
  const [attempt, setAttempt] = useState(0);

  // "Reset demo consent" from the profile: check again.
  useEffect(() => onConsentReset(() => setAttempt((n) => n + 1)), []);

  useEffect(() => {
    if (consentKnownAccepted(user.id)) {
      setState({ status: "ok" });
      return undefined;
    }
    let live = true;
    setState((s) => (s.status === "ask" ? s : { status: "loading" }));
    getConsentStatus(user.id)
      .then((info) => live && setState(info.upToDate ? { status: "ok" } : { status: "ask", info }))
      .catch((error) => live && setState({ status: "error", error }));
    return () => {
      live = false;
    };
  }, [user.id, attempt]);

  if (state.status === "ok") return children;
  if (state.status === "loading") return <SessionLoading />;
  if (state.status === "error") return <ConsentError error={state.error} onRetry={() => setAttempt((n) => n + 1)} />;
  return <ConsentScreen info={state.info} onAccepted={() => setState({ status: "ok" })} onStale={() => setAttempt((n) => n + 1)} />;
}

function Frame({ children }) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-50 via-white to-emerald-50/40">
      <main className="mx-auto flex w-full max-w-md flex-col px-5 py-8">{children}</main>
    </div>
  );
}

function ConsentError({ error, onRetry }) {
  const { resetAuth } = useAuth();
  const navigate = useNavigate();
  return (
    <Frame>
      <h1 className="text-xl font-bold text-emerald-950">We couldn&apos;t check your privacy settings</h1>
      <p role="alert" className="mt-2 text-sm text-emerald-900/80">
        {error?.message || "Please check your connection and try again."}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" onClick={onRetry} className="min-h-12 rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white">
          Try again
        </button>
        <button
          type="button"
          onClick={() => {
            resetAuth();
            navigate("/login", { replace: true });
          }}
          className="min-h-11 rounded-full px-5 text-sm font-semibold text-emerald-800"
        >
          Sign out
        </button>
      </div>
    </Frame>
  );
}

function ConsentScreen({ info, onAccepted, onStale }) {
  const { user, resetAuth } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const ids = useId();
  const phoneUser = user.method === LOGIN_METHOD.OTP;
  const items = ITEMS.filter((i) => !i.phoneOnly || phoneUser);
  const [ticked, setTicked] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const allTicked = items.every((i) => ticked[i.key]);
  const changed = Boolean(info.consent);

  const agree = async () => {
    setSaving(true);
    setError("");
    const values = Object.fromEntries(ITEMS.map((i) => [i.key, Boolean(ticked[i.key]) && (!i.phoneOnly || phoneUser)]));
    try {
      await acceptConsent(info.version, values, user.id);
      onAccepted();
    } catch (err) {
      setSaving(false);
      if (err?.status === 409) {
        onStale(); // the notice changed while this screen was open: load the new one
        return;
      }
      setError(err?.message || "Your choice couldn't be saved. Please try again.");
    }
  };

  return (
    <Frame>
      <motion.div {...fadeUp(reduced)}>
        <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Privacy</p>
        <h1 className="mt-1 text-2xl font-bold text-emerald-950">Before you start</h1>
        <p className="mt-2 text-sm text-emerald-900/80">
          EcoSetu needs your agreement to use your data as described here. You can withdraw it at any time in your profile.
        </p>

        {changed && (
          <p role="status" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            The privacy notice has changed since you last agreed. Please read it and agree again.
          </p>
        )}

        <div className="mt-5 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
          <h2 id={`${ids}-summary`} className="text-sm font-semibold text-emerald-950">
            Where your data goes
          </h2>
          <ul aria-labelledby={`${ids}-summary`} className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-emerald-900/85">
            {SUMMARY.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <Link to="/privacy" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 underline">
            Read the privacy notice
          </Link>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-emerald-950">Please confirm (all required)</legend>
          <div className="mt-2 flex flex-col gap-2">
            {items.map((item) => (
              <label
                key={item.key}
                className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border bg-white p-3.5 text-sm text-emerald-950 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500 ${
                  ticked[item.key] ? "border-emerald-400" : "border-emerald-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(ticked[item.key])}
                  onChange={(e) => setTicked((t) => ({ ...t, [item.key]: e.target.checked }))}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-emerald-700"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={agree}
          disabled={!allTicked || saving}
          aria-describedby={`${ids}-hint`}
          className="mt-5 min-h-12 w-full cursor-pointer rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 transition hover:bg-emerald-800 btn-disabled"
        >
          {saving ? "Saving…" : "Agree and continue"}
        </button>
        <p id={`${ids}-hint`} className="mt-2 text-center text-xs text-emerald-800/70">
          {allTicked ? "Thank you." : "Tick every box to continue."}
        </p>
        <button
          type="button"
          onClick={() => {
            resetAuth();
            navigate("/login", { replace: true });
          }}
          className="mt-2 min-h-11 w-full rounded-full px-5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
        >
          Sign out instead
        </button>
      </motion.div>
    </Frame>
  );
}
