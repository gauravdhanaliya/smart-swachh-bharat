import { useId, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { LOGIN_METHOD } from "../services/authSession";
import { INPUT, PRIMARY, messageFor } from "./accountFormStyles";

const SECONDARY =
  "min-h-11 cursor-pointer rounded-xl border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 btn-disabled-quiet";

function Message({ error, ok }) {
  return (
    <div aria-live="polite">
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {!error && ok && <p className="mt-2 text-sm font-medium text-emerald-800">{ok}</p>}
    </div>
  );
}

export function PasswordField({ id, label, value, onChange, autoComplete, describedBy }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      {/* label={null}: the caller renders the label itself (beside a link, say) */}
      {label !== null && (
        <label htmlFor={id} className="mt-3 block text-sm font-semibold text-emerald-950">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          className={`${INPUT} pr-20`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute top-1.5 right-1.5 min-h-11 cursor-pointer rounded-xl px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
    </>
  );
}

/** Optional display name. */
function NameForm() {
  const ids = useId();
  const { user, updateName } = useAuth();
  const [name, setName] = useState(user.name && user.name !== "citizen" ? user.name : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      await updateName(name.trim() || "citizen");
      setOk("Name saved.");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="py-4" noValidate>
      <label htmlFor={`${ids}-name`} className="block text-sm font-semibold text-emerald-950">
        Name <span className="font-normal text-emerald-800/70">(optional)</span>
      </label>
      <p id={`${ids}-name-help`} className="mt-0.5 text-xs text-emerald-800/70">
        Shown to the municipality on your reports. Leave it empty to show no name.
      </p>
      <div className="mt-1.5 flex gap-2">
        <input
          id={`${ids}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          aria-describedby={`${ids}-name-help`}
          className={`${INPUT} mt-0 min-w-0 flex-1`}
        />
        <button type="submit" disabled={busy} className={SECONDARY}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <Message error={error} ok={ok} />
    </form>
  );
}

/** An account whose email isn't verified yet. */
function VerifyEmail() {
  const { user, resendVerification, refreshAccount } = useAuth();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const run = async (which, fn) => {
    setBusy(which);
    setError("");
    setOk("");
    try {
      await fn();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="py-4">
      <p className="text-sm text-emerald-900/85">
        We sent a link to <span className="font-semibold text-emerald-950">{user.email}</span>. Open it to verify your email.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() =>
            run("check", async () => {
              const verified = await refreshAccount();
              setOk(verified ? "" : "Not verified yet. Open the link in the email, then try again.");
            })
          }
          className={SECONDARY}
        >
          {busy === "check" ? "Checking…" : "I've verified it"}
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => run("resend", async () => {
            await resendVerification();
            setOk("Sent again. Check your inbox (and spam).");
          })}
          className={SECONDARY}
        >
          {busy === "resend" ? "Sending…" : "Resend the email"}
        </button>
      </div>
      <Message error={error} ok={ok} />
    </div>
  );
}

/** "Change password": the current one, then a new one (8+ characters). */
function ChangePasswordForm() {
  const ids = useId();
  const { changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      await changePassword({ current, next });
      setCurrent("");
      setNext("");
      setOk("Password changed.");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${ids}-form`}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between text-left text-base font-bold text-emerald-950"
      >
        Change password
        <svg viewBox="0 0 24 24" className={`h-5 w-5 text-emerald-600 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <form id={`${ids}-form`} onSubmit={save} aria-label="Change password" noValidate>
          <PasswordField id={`${ids}-current`} label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordField id={`${ids}-next`} label="New password" value={next} onChange={setNext} autoComplete="new-password" describedBy={`${ids}-next-help`} />
          <p id={`${ids}-next-help`} className="mt-1 text-xs text-emerald-800/80">
            At least 8 characters.
          </p>
          <Message error={error} ok={ok} />
          <button type="submit" disabled={busy || !current || next.length < 8} className={PRIMARY}>
            {busy ? "Changing…" : "Change password"}
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * The account on the profile: its email (masked) and whether it is verified,
 * an optional name, and "Change password". Deleting the account is under
 * Privacy and data.
 */
export default function AccountSection() {
  const { user } = useAuth();
  const email = user.method === LOGIN_METHOD.EMAIL;
  const legacy = user.method === LOGIN_METHOD.LEGACY;

  return (
    <section aria-labelledby="account-title" className="flex flex-col gap-1">
      <h2 id="account-title" className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">
        Your account
      </h2>
      <div className="divide-y divide-emerald-100 rounded-2xl border border-emerald-100 bg-white px-4">
        <p data-account-status className="py-3.5 text-sm text-emerald-900/85">
          {email ? (
            <>
              Signed in as <span className="font-semibold text-emerald-950">{user.email}</span>
              {user.emailVerified ? " · verified" : " · not verified yet"}
            </>
          ) : legacy ? (
            "Made with the old phone sign-in, which has been switched off. Create an account with your email to keep reporting."
          ) : (
            "Demo account: sample data, shared by everyone trying the demo."
          )}
        </p>
        <NameForm />
        {email && !user.emailVerified && <VerifyEmail />}
        {email && <ChangePasswordForm />}
      </div>
    </section>
  );
}
