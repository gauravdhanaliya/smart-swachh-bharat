import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAuth } from "../context/AuthContext";
import { LOGIN_METHOD } from "../services/authSession";
import { messageFor } from "./accountFormStyles";
import { fadeUp } from "../utils/motion";

const dismissKey = (uid) => `ssb_verify_banner_dismissed_${uid}`;

function wasDismissed(uid) {
  try {
    return sessionStorage.getItem(dismissKey(uid)) === "1";
  } catch {
    return false;
  }
}

/**
 * "Verify your email", shown to an email account that hasn't verified yet.
 * The account works meanwhile (a citizen); a worker or official role applies
 * only once the email is verified. Dismissing hides it for this browser
 * session; it comes back next time until the email is verified.
 */
export default function VerifyEmailBanner() {
  const { user, resendVerification, refreshAccount } = useAuth();
  const reduced = useReducedMotion();
  const [dismissed, setDismissed] = useState(() => (user ? wasDismissed(user.id) : false));
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });

  const show = user && user.method === LOGIN_METHOD.EMAIL && !user.emailVerified && !dismissed;

  const run = async (which, fn) => {
    setBusy(which);
    setMessage({ text: "", error: false });
    try {
      setMessage({ text: await fn(), error: false });
    } catch (err) {
      setMessage({ text: messageFor(err), error: true });
    } finally {
      setBusy("");
    }
  };

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(user.id), "1");
    } catch {
      // storage blocked: hidden until the page reloads
    }
    setDismissed(true);
  };

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.section {...fadeUp(reduced)} aria-labelledby="verify-title" data-verify-banner className="mx-4 mt-3 shrink-0 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <div className="flex items-start gap-2">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            <div className="min-w-0 flex-1">
              <h2 id="verify-title" className="text-sm font-semibold">
                Verify your email
              </h2>
              <p className="text-sm text-amber-900">
                Open the link we sent to <span className="font-semibold whitespace-nowrap">{user.email}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="-mt-2 -mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-amber-900 hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 pl-7">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                run("resend", async () => {
                  await resendVerification();
                  return "Sent again. Check your inbox and spam folder.";
                })
              }
              className="min-h-11 cursor-pointer rounded-full px-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-wait"
            >
              {busy === "resend" ? "Sending…" : "Resend email"}
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                run("check", async () => ((await refreshAccount()) ? "" : "Not verified yet. Open the link in the email, then try again."))
              }
              className="min-h-11 cursor-pointer rounded-full px-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-wait"
            >
              {busy === "check" ? "Checking…" : "I've verified it"}
            </button>
          </div>
          <div aria-live="polite">
            {message.text && (
              <p role={message.error ? "alert" : undefined} className={`pl-7 text-sm ${message.error ? "font-medium text-red-700" : "text-amber-900"}`}>
                {message.text}
              </p>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
