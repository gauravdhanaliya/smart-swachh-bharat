import { useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import ScreenShell from "../components/ScreenShell";
import SessionLoading from "../components/SessionLoading";
import { useAuth } from "../context/AuthContext";
import { LOGIN_METHOD } from "../services/authSession";
import { RECAPTCHA_CONTAINER_ID, confirmDeleteOtp, firebaseDeletionAvailable, sendDeleteOtp } from "../services/authService";
import { deleteMyData } from "../services/consentService";
import { DELETED_ITEMS, KEPT_ITEMS } from "../data/privacy";
import { authErrorMessage, digitsOnly, validateOtp, validatePhone } from "../utils/phoneAuth";
import { step as stepMotion } from "../utils/motion";

const CONFIRM_WORD = "DELETE";
const DELETED_NOTICE = "Your data has been deleted. Thank you for using EcoSetu.";
const STEPS = { review: 1, verify: 2, done: 3 };

/**
 * Delete my data. Removes the data (unlike Withdraw consent, which keeps it):
 *   1. the user reads what is deleted and what is kept, and types DELETE;
 *   2. the app's data is deleted on the server (DELETE /api/me/data);
 *   3. a fresh OTP, then user.delete() removes the Firebase sign-in on this
 *      device (Firebase needs a recent sign-in; auth/requires-recent-login
 *      asks for a new code);
 *   4. done: signed out, back to the login page.
 * Demo accounts can't reach it. Once step 2 has run the session is gone, so
 * the flow keeps what it needs from the start (who, which login method).
 */
export default function DeleteMyData() {
  const { user, status } = useAuth();
  const [who] = useState(() => (user ? { id: user.id, method: user.method, phone: user.phone ?? null } : null));

  if (status === "loading") return <SessionLoading />;
  if (!who) return <Navigate to="/login" replace />;
  if (who.method === LOGIN_METHOD.DEMO) return <DemoCantDelete />;
  return <DeleteFlow who={who} />;
}

function Header({ step }) {
  return (
    <>
      <h1 className="mt-2 text-2xl font-bold text-emerald-950">Delete my data</h1>
      <p role="note" className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <strong>This screen deletes your data.</strong> It is permanent and can&apos;t be undone.
      </p>
      {step && (
        <p className="mt-3 text-xs font-semibold tracking-wide text-emerald-800/70 uppercase" aria-live="polite">
          Step {step} of 3
        </p>
      )}
    </>
  );
}

function DemoCantDelete() {
  const navigate = useNavigate();
  return (
    <ScreenShell showBack>
      <Header />
      <p className="mt-4 text-sm text-emerald-900/85">
        Demo accounts are shared by everyone trying the app, so they can&apos;t be deleted. Sign in with your phone number to have
        data of your own to delete.
      </p>
      <button type="button" onClick={() => navigate(-1)} className="mt-5 min-h-11 rounded-full px-5 text-sm font-semibold text-emerald-800">
        Back
      </button>
    </ScreenShell>
  );
}

function DeleteFlow({ who }) {
  const navigate = useNavigate();
  const { resetAuth } = useAuth();
  const reduced = useReducedMotion();
  const [step, setStep] = useState("review"); // review | verify | done
  const [result, setResult] = useState(null);
  const [firebaseKept, setFirebaseKept] = useState(false);

  const finish = () => {
    resetAuth({ notice: DELETED_NOTICE });
    navigate("/login", { replace: true });
  };

  const afterServer = async (res) => {
    setResult(res);
    const needsFirebase = who.method === LOGIN_METHOD.OTP && (await firebaseDeletionAvailable().catch(() => false));
    setStep(needsFirebase ? "verify" : "done");
  };

  return (
    <ScreenShell showBack={step === "review"}>
      <Header step={STEPS[step]} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} {...stepMotion(reduced, 1)}>
          {step === "review" && <Review onDeleted={afterServer} />}
          {step === "verify" && (
            <VerifyPhone
              who={who}
              onDeleted={() => setStep("done")}
              onSkip={() => {
                setFirebaseKept(true);
                setStep("done");
              }}
            />
          )}
          {step === "done" && <Done result={result} firebaseKept={firebaseKept} onFinish={finish} />}
        </motion.div>
      </AnimatePresence>
    </ScreenShell>
  );
}

function Review({ onDeleted }) {
  const ids = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = typed === CONFIRM_WORD;

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await onDeleted(await deleteMyData());
    } catch (err) {
      setBusy(false);
      setError(err?.message || "Your data couldn't be deleted. Nothing was changed; please try again.");
    }
  };

  return (
    <div className="mt-2">
      <p className="text-sm text-emerald-900/80">
        Only want to stop for now?{" "}
        <Link to="/account/withdraw" className="font-semibold text-emerald-700 underline">
          Withdraw consent instead
        </Link>{" "}
        (signs you out, keeps your data).
      </p>

      <div className="mt-4 rounded-3xl border border-red-100 bg-white p-4 shadow-sm">
        <h2 id={`${ids}-deleted`} className="text-sm font-semibold text-red-900">
          Will be deleted
        </h2>
        <ul aria-labelledby={`${ids}-deleted`} className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-emerald-950/85">
          {DELETED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2 id={`${ids}-kept`} className="mt-4 text-sm font-semibold text-emerald-950">
          Will be kept
        </h2>
        <ul aria-labelledby={`${ids}-kept`} className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-emerald-950/85">
          {KEPT_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <label htmlFor={`${ids}-confirm`} className="mt-5 block text-sm font-semibold text-emerald-950">
        Type DELETE to confirm
      </label>
      <input
        id={`${ids}-confirm`}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-describedby={`${ids}-confirm-help`}
        className="mt-1.5 min-h-12 w-full rounded-2xl border border-red-200 bg-white px-4 text-base tracking-widest text-emerald-950 focus:border-red-400 focus:ring-2 focus:ring-red-300 focus:outline-none"
      />
      <p id={`${ids}-confirm-help`} className="mt-1 text-xs text-emerald-800/70">
        In capital letters. After this, you&apos;ll confirm your phone number to remove your sign-in too.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={remove}
        disabled={!ready || busy}
        className="mt-5 mb-4 min-h-12 w-full cursor-pointer rounded-full bg-red-600 px-5 text-sm font-semibold text-white shadow-md shadow-red-900/20 hover:bg-red-700 btn-disabled"
      >
        {busy ? "Deleting…" : "Delete my data"}
      </button>
    </div>
  );
}

function VerifyPhone({ who, onDeleted, onSkip }) {
  const ids = useId();
  const codeRef = useRef(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmSkip, setConfirmSkip] = useState(false);

  useEffect(() => {
    if (sent) codeRef.current?.focus();
  }, [sent]);

  const send = async () => {
    const check = validatePhone(phone);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendDeleteOtp(phone);
      setCode("");
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const check = validateOtp(code);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await confirmDeleteOtp(code, { expectedUid: who.id });
      onDeleted();
    } catch (err) {
      setBusy(false);
      // A used code can't be retried: recent-login and wrong-account errors need a new code.
      if (["auth/requires-recent-login", "auth/user-mismatch", "auth/code-expired"].includes(err?.code)) setSent(false);
      setError(authErrorMessage(err));
    }
  };

  return (
    <div className="mt-2">
      <h2 className="text-lg font-bold text-emerald-950">Verify your phone</h2>
      <p className="mt-1 text-sm text-emerald-900/80">
        Your EcoSetu data is deleted. Last step: remove your phone number from our sign-in provider (Firebase). For your
        security it needs a fresh code{who.phone ? ` sent to the number you signed in with (${who.phone})` : ""}.
      </p>

      <label htmlFor={`${ids}-phone`} className="mt-4 block text-sm font-semibold text-emerald-950">
        Phone number
      </label>
      <div className="mt-1.5 flex min-h-12 items-center rounded-2xl border border-emerald-200 bg-white focus-within:ring-2 focus-within:ring-emerald-500">
        <span className="pl-4 text-base font-semibold text-emerald-900">+91</span>
        <input
          id={`${ids}-phone`}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={phone}
          disabled={sent}
          onChange={(e) => setPhone(digitsOnly(e.target.value, 10))}
          className="min-w-0 flex-1 bg-transparent px-3 text-base text-emerald-950 outline-none disabled:text-disabled-ink"
        />
      </div>

      {!sent ? (
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="mt-3 min-h-12 w-full cursor-pointer rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white btn-disabled"
        >
          {busy ? "Sending…" : "Send code"}
        </button>
      ) : (
        <>
          <label htmlFor={`${ids}-code`} className="mt-4 block text-sm font-semibold text-emerald-950">
            6-digit code
          </label>
          <input
            id={`${ids}-code`}
            ref={codeRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(digitsOnly(e.target.value, 6))}
            className="mt-1.5 min-h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-center text-lg tracking-[0.4em] text-emerald-950 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="mt-3 min-h-12 w-full cursor-pointer rounded-full bg-red-600 px-5 text-sm font-semibold text-white btn-disabled"
          >
            {busy ? "Deleting…" : "Confirm and delete sign-in"}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <div id={RECAPTCHA_CONTAINER_ID} />

      <div className="mt-6 mb-4 border-t border-emerald-100 pt-4">
        {confirmSkip ? (
          <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
            <p>Your phone number will stay with Firebase. Your EcoSetu data is already deleted either way.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={onSkip} className="min-h-11 rounded-full bg-white px-4 font-semibold shadow-sm">
                Skip this step
              </button>
              <button type="button" onClick={() => setConfirmSkip(false)} className="min-h-11 rounded-full px-4 font-semibold">
                Go back
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmSkip(true)} className="min-h-11 text-sm font-semibold text-emerald-800 underline">
            I can&apos;t get a code now
          </button>
        )}
      </div>
    </div>
  );
}

function Done({ result, firebaseKept, onFinish }) {
  const kept = result?.anonymised?.complaints ?? 0;
  return (
    <div className="mt-2 mb-4">
      <h2 className="text-lg font-bold text-emerald-950">Your data has been deleted</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-emerald-900/85">
        <li>Your account and personal data are gone from EcoSetu.</li>
        <li>
          {kept === 1 ? "1 complaint is" : `${kept} complaints are`} kept for the municipality as “Deleted user”, with no link to you.
        </li>
        <li>{firebaseKept ? "Your Firebase sign-in was not removed." : "Your Firebase sign-in has been removed."}</li>
      </ul>
      <button
        type="button"
        onClick={onFinish}
        className="mt-5 min-h-12 w-full cursor-pointer rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-900/20"
      >
        Finish
      </button>
    </div>
  );
}
