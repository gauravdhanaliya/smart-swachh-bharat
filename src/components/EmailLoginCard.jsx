import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PasswordField } from "./AccountSection";
import { INPUT, LINK as LINK_STYLE, PRIMARY, messageFor } from "./accountFormStyles";
import { useAuth } from "../context/AuthContext";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

const TITLES = { login: "Log in", create: "Create account", forgot: "Reset your password", sent: "Check your inbox" };

// Plain brand-green text links, no underline (accountFormStyles.LINK).
const LINK = LINK_STYLE;

/**
 * The start screen's card: log in, create an account, or reset a password,
 * all in place (no sheet). A new account is a citizen at once; the app asks
 * them to verify their email with a banner. The role always comes from the
 * server. No message here says whether an email has an account.
 *
 * onSignedIn(user): called once signed in.
 * onBusyChange(bool): true while signing in, so the start screen doesn't
 * navigate away under the card.
 */
export default function EmailLoginCard({ onSignedIn, onBusyChange = () => {}, footer = null }) {
  const [view, setView] = useState("login");
  const [email, setEmail] = useState("");
  const reduced = useReducedMotion();
  const headingRef = useRef(null);
  const moved = useRef(false);

  // A new view: its title takes focus (screen readers hear the change), but
  // not on first load, where focus stays where the browser put it.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [view]);
  const go = (next) => {
    moved.current = true;
    setView(next);
  };

  const shared = { email, setEmail, go, setBusy: onBusyChange };
  const fade = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.12 } }, exit: { opacity: 0, transition: { duration: 0.08 } } }
    : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0, transition: { duration: 0.2 } }, exit: { opacity: 0, transition: { duration: 0.1 } } };

  return (
    <section aria-labelledby="start-title" data-email-card className="rounded-2xl border border-line bg-white p-4">
      <h2 id="start-title" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-ink outline-none">
        {TITLES[view]}
      </h2>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view} {...fade} data-email-view={view}>
          {view === "login" && <LoginView {...shared} onSignedIn={onSignedIn} />}
          {view === "create" && <CreateView {...shared} onSignedIn={onSignedIn} />}
          {view === "forgot" && <ForgotView {...shared} />}
          {view === "sent" && <SentView email={email} onBack={() => go("login")} />}
        </motion.div>
      </AnimatePresence>
      {footer}
    </section>
  );
}

/** Field checks before anything is sent. */
function check({ email, password, needPassword = true, newPassword = false }) {
  const errors = {};
  if (!EMAIL_RE.test(email.trim())) errors.email = "Enter a valid email address.";
  if (needPassword) {
    if (!password) errors.password = "Enter your password.";
    else if (newPassword && password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  }
  return errors;
}

function EmailField({ id, value, onChange, error }) {
  return (
    <>
      <label htmlFor={id} className="mt-3 block text-sm font-semibold text-emerald-950">
        Email
      </label>
      <input
        id={id}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${INPUT} mt-1`}
      />
      {error && (
        <p id={`${id}-error`} data-field-error className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </>
  );
}

function FieldNote({ id, error, hint }) {
  if (!error && !hint) return null;
  return (
    <p id={id} data-field-error={error ? "" : undefined} className={`mt-1 text-sm ${error ? "font-medium text-red-700" : "text-emerald-800/80"}`}>
      {error || hint}
    </p>
  );
}

function FormError({ error }) {
  return (
    <div aria-live="assertive">
      {error && (
        <p role="alert" data-start-error className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** One submit at a time, with its error in words. */
function useSubmit(setBusy) {
  const [busy, setLocalBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const run = async (fn) => {
    if (running.current) return;
    running.current = true;
    setError("");
    setLocalBusy(true);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    } finally {
      running.current = false;
      setLocalBusy(false);
    }
  };
  return { busy, error, run };
}

function LoginView({ email, setEmail, go, setBusy, onSignedIn }) {
  const ids = useId();
  const { logInWithEmail } = useAuth();
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const { busy, error, run } = useSubmit(setBusy);

  const submit = (e) => {
    e.preventDefault();
    const found = check({ email, password });
    setErrors(found);
    if (Object.keys(found).length) return;
    run(async () => onSignedIn(await logInWithEmail({ email: email.trim(), password })));
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Log in">
      <EmailField id={`${ids}-email`} value={email} onChange={setEmail} error={errors.email} />
      <div className="mt-3 flex items-end justify-between">
        <label htmlFor={`${ids}-password`} className="block text-sm font-semibold text-emerald-950">
          Password
        </label>
        <button type="button" onClick={() => go("forgot")} className={`${LINK} -mr-2 -mb-3`}>
          Forgot password?
        </button>
      </div>
      <PasswordField
        id={`${ids}-password`}
        label={null}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        describedBy={errors.password ? `${ids}-password-note` : undefined}
      />
      <FieldNote id={`${ids}-password-note`} error={errors.password} />
      <FormError error={error} />
      <button type="submit" disabled={busy} aria-busy={busy || undefined} className={PRIMARY}>
        {busy ? "Logging in…" : "Log in"}
      </button>
      <p className="mt-1 text-center text-sm text-emerald-900/80">
        New here?{" "}
        <button type="button" onClick={() => go("create")} className={LINK}>
          Create account
        </button>
      </p>
    </form>
  );
}

function CreateView({ email, setEmail, go, setBusy, onSignedIn }) {
  const ids = useId();
  const { createAccount } = useAuth();
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const { busy, error, run } = useSubmit(setBusy);

  const submit = (e) => {
    e.preventDefault();
    const found = check({ email, password, newPassword: true });
    setErrors(found);
    if (Object.keys(found).length) return;
    run(async () => onSignedIn((await createAccount({ email: email.trim(), password })).user));
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Create account">
      <EmailField id={`${ids}-email`} value={email} onChange={setEmail} error={errors.email} />
      <PasswordField
        id={`${ids}-password`}
        label="Choose a password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        describedBy={`${ids}-password-note`}
      />
      <FieldNote id={`${ids}-password-note`} error={errors.password} hint={`At least ${MIN_PASSWORD} characters.`} />
      <FormError error={error} />
      <button type="submit" disabled={busy} aria-busy={busy || undefined} className={PRIMARY}>
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="mt-1 text-center text-sm text-emerald-900/80">
        Have an account?{" "}
        <button type="button" onClick={() => go("login")} className={LINK}>
          Log in
        </button>
      </p>
    </form>
  );
}

function ForgotView({ email, setEmail, go, setBusy }) {
  const ids = useId();
  const { resetPassword } = useAuth();
  const [errors, setErrors] = useState({});
  const { busy, error, run } = useSubmit(setBusy);

  const submit = (e) => {
    e.preventDefault();
    const found = check({ email, needPassword: false });
    setErrors(found);
    if (Object.keys(found).length) return;
    run(async () => {
      await resetPassword(email.trim());
      setBusy(false);
      go("sent");
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Reset your password">
      <p className="mt-1 text-sm text-emerald-900/80">We&apos;ll email you a link to choose a new password.</p>
      <EmailField id={`${ids}-email`} value={email} onChange={setEmail} error={errors.email} />
      <FormError error={error} />
      <button type="submit" disabled={busy} aria-busy={busy || undefined} className={PRIMARY}>
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <div className="mt-1 flex justify-center">
        <button type="button" onClick={() => go("login")} className={LINK}>
          Back to log in
        </button>
      </div>
    </form>
  );
}

function SentView({ email, onBack }) {
  return (
    <div>
      <p role="status" className="mt-2 rounded-2xl bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-950">
        If <strong className="break-all">{email.trim()}</strong> has an EcoSetu account, a link to reset its password is on its way. Check your spam
        folder too.
      </p>
      <button type="button" onClick={onBack} className={PRIMARY}>
        Back to log in
      </button>
    </div>
  );
}
