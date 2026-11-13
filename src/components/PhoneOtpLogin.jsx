import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import PrimaryButton from "./PrimaryButton";
import OtpBoxes from "./OtpBoxes";
import { RECAPTCHA_CONTAINER_ID, confirmOtp, resetPendingOtp, sendOtp } from "../services/authService";
import { ApiError } from "../services/session";
import { COUNTRY_CODE, OTP_LENGTH, PHONE_LENGTH, authErrorMessage, digitsOnly, maskPhone, validateOtp, validatePhone } from "../utils/phoneAuth";
import { step as stepMotion } from "../utils/motion";

export const RESEND_COOLDOWN_SECONDS = 30;

const TEXT_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 btn-disabled-quiet disabled:hover:bg-transparent";

/**
 * The message slot under a field. The live region is always there, so a
 * message that appears in it is announced; the message itself is role=alert.
 * It keeps its height when empty (no jump when a message arrives), and shows
 * `hint` when there is no error.
 */
function FieldMessage({ id, error, hint, hintId }) {
  return (
    <div aria-live="assertive" className="mt-1.5 min-h-5 text-sm leading-5">
      {error ? (
        <p id={id} role="alert" className="font-medium text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-emerald-800/80">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Real phone login: Indian mobile number -> 6 digit OTP (Firebase), as two
 * steps; the OTP step replaces the phone step.
 * Calls `onVerified({ uid, phone, idToken })` once the OTP is confirmed; it may
 * return a Promise (API mode, where the server finishes the sign-in), whose
 * rejection is shown here. There is no role choice: the server, or locally
 * the client, decides the role.
 */
export default function PhoneOtpLogin({ onVerified }) {
  const ids = useId();
  const reduced = useReducedMotion();
  const phoneRef = useRef(null);
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [cameBack, setCameBack] = useState(false); // returned from the OTP step: focus the number
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpFocusKey, setOtpFocusKey] = useState(0);
  // Resend unlocks at a fixed time, so a throttled background tab can't stretch or skip it.
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (resendAt <= Date.now()) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  // Leaving the screen drops any OTP request in progress.
  useEffect(() => () => resetPendingOtp(), []);

  useEffect(() => {
    if (step === "phone" && cameBack) phoneRef.current?.focus();
  }, [step, cameBack]);

  const phoneCheck = validatePhone(phone);
  // Only a complete number is judged; while typing, the hint stays.
  const phoneError = error || (phone.length === PHONE_LENGTH && !phoneCheck.ok ? phoneCheck.error : "");

  const sendCode = async () => {
    setError("");
    setBusy(true);
    try {
      await sendOtp(phone);
      setOtp("");
      setStep("otp");
      setOtpFocusKey((k) => k + 1);
      setNow(Date.now());
      setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const check = validateOtp(otp);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const { uid, idToken } = await confirmOtp(otp);
      await onVerified({ uid, phone, idToken });
    } catch (e) {
      // A refusal from the EcoSetu API carries its own message; Firebase errors carry a code.
      setError(e instanceof ApiError ? e.message : authErrorMessage(e));
      setBusy(false);
      // Start again: empty boxes (shown in red until the first new digit), focus on the first.
      setOtp("");
      setOtpFocusKey((k) => k + 1);
    }
  };

  const changeNumber = () => {
    resetPendingOtp();
    setStep("phone");
    setCameBack(true);
    setOtp("");
    setError("");
    setResendAt(0);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (step === "phone") {
      if (phoneCheck.ok) sendCode();
    } else if (otp.length === OTP_LENGTH) {
      verify();
    }
  };

  const errorId = `${ids}-error`;
  const motionProps = stepMotion(reduced, step === "otp" ? 1 : -1);

  return (
    <>
      <motion.form key={step} initial={motionProps.initial} animate={motionProps.animate} onSubmit={onSubmit} noValidate>
        {step === "phone" ? (
          <>
            <label htmlFor={`${ids}-phone`} className="block text-sm font-semibold text-emerald-950">
              Mobile number
            </label>
            <div
              data-field
              className={`mt-1.5 flex h-12 items-center rounded-2xl border bg-white transition-colors focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-200 ${phoneError ? "border-red-400" : "border-emerald-200"}`}
            >
              <span id={`${ids}-prefix`} className="flex h-full items-center border-r border-emerald-100 pr-3 pl-4 font-semibold text-emerald-900">
                {COUNTRY_CODE}
              </span>
              <input
                ref={phoneRef}
                id={`${ids}-phone`}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => {
                  setPhone(digitsOnly(e.target.value, PHONE_LENGTH));
                  setError("");
                }}
                placeholder="10 digit number"
                maxLength={PHONE_LENGTH}
                aria-invalid={Boolean(phoneError) || undefined}
                aria-describedby={`${ids}-prefix ${phoneError ? errorId : `${ids}-hint`}`}
                className="h-full min-w-0 flex-1 rounded-r-2xl bg-transparent px-3 text-base tracking-wide text-emerald-950 placeholder:text-emerald-800/50 outline-none"
              />
            </div>
            <FieldMessage id={errorId} error={phoneError} hint="We'll send a 6 digit code by SMS." hintId={`${ids}-hint`} />
            <PrimaryButton type="submit" disabled={busy || !phoneCheck.ok} className="mt-3 h-12 py-0">
              {busy ? "Sending…" : "Send OTP"}
            </PrimaryButton>
          </>
        ) : (
          <>
            <p id={`${ids}-otp-label`} className="text-sm font-semibold text-emerald-950">
              Enter the 6 digit code
            </p>
            <p id={`${ids}-sent-to`} className="mb-2 text-sm text-emerald-800/80">
              Sent to <span className="font-semibold text-emerald-950">{maskPhone(phone)}</span>
            </p>
            <OtpBoxes
              value={otp}
              onChange={(next) => {
                setOtp(next);
                setError("");
              }}
              labelledBy={`${ids}-otp-label`}
              describedBy={error ? `${ids}-sent-to ${errorId}` : `${ids}-sent-to`}
              invalid={Boolean(error)}
              disabled={busy}
              autoFocus
              focusKey={otpFocusKey}
            />
            <FieldMessage id={errorId} error={error} />
            <PrimaryButton type="submit" disabled={busy || otp.length !== OTP_LENGTH} className="mt-3 h-12 py-0">
              {busy ? "Please wait…" : "Verify & continue"}
            </PrimaryButton>
            <div className="mt-1 flex items-center justify-between">
              <button type="button" onClick={changeNumber} disabled={busy} className={`${TEXT_BUTTON} -ml-3`}>
                Change number
              </button>
              <button type="button" onClick={sendCode} disabled={busy || cooldown > 0} className={`${TEXT_BUTTON} -mr-3 tabular-nums`}>
                {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
              </button>
            </div>
          </>
        )}
      </motion.form>

      {/* Mount point for Firebase's invisible reCAPTCHA. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </>
  );
}
