import { useId, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import ScreenShell from "../components/ScreenShell";
import SessionLoading from "../components/SessionLoading";
import { useAuth } from "../context/AuthContext";
import { LOGIN_METHOD } from "../services/authSession";
import { deleteFirebaseAccount, verifyPassword } from "../services/authService";
import { deleteMyData } from "../services/consentService";
import { DELETED_ITEMS, KEPT_ITEMS } from "../data/privacy";
import { accountErrorMessage } from "../utils/accountErrors";
import { step as stepMotion } from "../utils/motion";

const CONFIRM_WORD = "DELETE";
const DELETED_NOTICE = "Your data has been deleted. Thank you for using EcoSetu.";
const STEPS = { review: 1, done: 2 };

/**
 * Delete my data. Removes the data (unlike Withdraw consent, which keeps it):
 *   1. the user reads what is deleted and what is kept, and types DELETE. An
 *      email account also enters its password, which is checked with
 *      Firebase FIRST (re-authentication): a wrong one deletes nothing. (An
 *      account the old phone sign-in made has no password to ask for.)
 *   2. the app's data is deleted on the server (DELETE /api/me/data), then
 *      the Firebase account on this device (user.delete()).
 *   3. done: signed out, back to the start screen.
 * Demo accounts can't reach it. Once the server step has run the session is
 * gone, so the flow keeps what it needs from the start (who, which account).
 */
export default function DeleteMyData() {
  const { user, status } = useAuth();
  const [who] = useState(() => (user ? { id: user.id, method: user.method, email: user.email ?? null } : null));

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
          Step {step} of 2
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
        Demo accounts are shared by everyone trying the app, so they can&apos;t be deleted. Continue as a citizen to have data of your
        own to delete.
      </p>
      <button type="button" onClick={() => navigate(-1)} className="mt-5 min-h-11 rounded-xl px-5 text-sm font-semibold text-emerald-800">
        Back
      </button>
    </ScreenShell>
  );
}

function DeleteFlow({ who }) {
  const navigate = useNavigate();
  const { resetAuth } = useAuth();
  const reduced = useReducedMotion();
  const [step, setStep] = useState("review"); // review | done
  const [result, setResult] = useState(null);
  const [firebase, setFirebase] = useState("deleted"); // deleted | signed-out | kept

  const finish = () => {
    resetAuth({ notice: DELETED_NOTICE });
    navigate("/login", { replace: true });
  };

  return (
    <ScreenShell showBack={step === "review"}>
      <Header step={STEPS[step]} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} {...stepMotion(reduced, 1)}>
          {step === "review" && (
            <Review
              who={who}
              onDone={(res, firebaseState) => {
                setResult(res);
                setFirebase(firebaseState);
                setStep("done");
              }}
            />
          )}
          {step === "done" && <Done result={result} firebase={firebase} onFinish={finish} />}
        </motion.div>
      </AnimatePresence>
    </ScreenShell>
  );
}

function Review({ who, onDone }) {
  const ids = useId();
  const saved = who.method === LOGIN_METHOD.EMAIL;
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = typed === CONFIRM_WORD && (!saved || password.length > 0);

  const remove = async () => {
    setBusy(true);
    setError("");
    // 1. The account proves it is its owner before anything is deleted.
    if (saved) {
      try {
        await verifyPassword(password);
      } catch (err) {
        setBusy(false);
        setError(accountErrorMessage(err));
        return;
      }
    }
    // 2. The app's data, on the server. If this fails nothing has changed.
    let res;
    try {
      res = await deleteMyData();
    } catch (err) {
      setBusy(false);
      setError(err?.message || "Your data couldn't be deleted. Nothing was changed; please try again.");
      return;
    }
    // 3. The Firebase account on this device.
    let firebaseState = "deleted";
    try {
      const { deleted } = await deleteFirebaseAccount({ expectedUid: who.id });
      if (!deleted) firebaseState = "signed-out";
    } catch {
      firebaseState = "kept";
    }
    onDone(res, firebaseState);
  };

  return (
    <div className="mt-2">
      <p className="text-sm text-emerald-900/80">
        Only want to stop for now?{" "}
        <Link to="/account/withdraw" className="font-semibold text-emerald-700">
          Withdraw consent instead
        </Link>{" "}
        (signs you out, keeps your data).
      </p>

      <div className="mt-4 rounded-2xl border border-red-100 bg-white p-4">
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

      {saved && (
        <>
          <label htmlFor={`${ids}-password`} className="mt-5 block text-sm font-semibold text-emerald-950">
            Your password
          </label>
          <input
            id={`${ids}-password`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            aria-describedby={`${ids}-password-help`}
            className="mt-1.5 min-h-12 w-full rounded-2xl border border-red-200 bg-white px-4 text-base text-emerald-950 focus:border-red-400 focus:ring-2 focus:ring-red-300 focus:outline-none"
          />
          <p id={`${ids}-password-help`} className="mt-1 text-xs text-emerald-800/70">
            For {who.email ?? "your account"}. Checked before anything is deleted.
          </p>
        </>
      )}

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
        In capital letters.
      </p>

      <div aria-live="assertive">
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={remove}
        disabled={!ready || busy}
        className="mt-5 mb-4 min-h-12 w-full cursor-pointer rounded-xl bg-red-600 px-5 text-sm font-semibold text-white shadow-red-900/20 hover:bg-red-700 btn-disabled"
      >
        {busy ? "Deleting…" : "Delete my data"}
      </button>
    </div>
  );
}

const FIREBASE_LINE = {
  deleted: "Your sign-in account has been removed.",
  "signed-out": "There was no sign-in account on this device to remove.",
  kept: "Your sign-in account couldn't be removed from this device. It holds no EcoSetu data; you can ignore it.",
};

function Done({ result, firebase, onFinish }) {
  const kept = result?.anonymised?.complaints ?? 0;
  return (
    <div className="mt-2 mb-4">
      <h2 className="text-lg font-bold text-emerald-950">Your data has been deleted</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-emerald-900/85">
        <li>Your account and personal data are gone from EcoSetu.</li>
        <li>
          {kept === 1 ? "1 complaint is" : `${kept} complaints are`} kept for the municipality as “Deleted user”, with no link to you.
        </li>
        <li>{FIREBASE_LINE[firebase]}</li>
      </ul>
      <button
        type="button"
        onClick={onFinish}
        className="mt-5 min-h-12 w-full cursor-pointer rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white"
      >
        Finish
      </button>
    </div>
  );
}
