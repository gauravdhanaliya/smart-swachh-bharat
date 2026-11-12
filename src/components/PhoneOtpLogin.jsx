import { useEffect, useState } from "react";
import PrimaryButton from "./PrimaryButton";
import { RECAPTCHA_CONTAINER_ID, confirmOtp, resetPendingOtp, sendOtp } from "../services/authService";
import { ApiError } from "../services/session";
import {
  COUNTRY_CODE,
  OTP_LENGTH,
  PHONE_LENGTH,
  authErrorMessage,
  digitsOnly,
  maskPhone,
  validateOtp,
  validatePhone,
} from "../utils/phoneAuth";

export const RESEND_COOLDOWN_SECONDS = 30;

const INPUT =
  "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-emerald-950 placeholder:text-emerald-800/40 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200";
const TEXT_BUTTON =
  "inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-emerald-800/40 disabled:hover:bg-transparent";

/**
 * Real phone login: Indian mobile number -> 6 digit OTP (Firebase).
 * Calls `onVerified({ uid, phone, idToken })` once the OTP is confirmed; it may
 * return a Promise (API mode, where the server finishes the sign-in), whose
 * rejection is shown here. There is no role choice: the server, or locally
 * the client, makes an OTP user a citizen.
 */
export default function PhoneOtpLogin({ onVerified }) {
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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

  const requestOtp = async () => {
    const check = validatePhone(phone);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError("");
    setBusy(true);
    try {
      await sendOtp(phone);
      setOtp("");
      setStep("otp");
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
    }
  };

  const changeNumber = () => {
    resetPendingOtp();
    setStep("phone");
    setOtp("");
    setError("");
    setResendAt(0);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (step === "phone") requestOtp();
    else verify();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {step === "phone" ? (
        <>
          <div>
            <label htmlFor="login-phone" className="text-sm font-semibold text-emerald-950">
              Mobile number
            </label>
            <div className="mt-1.5 flex items-stretch gap-2">
              <span className="flex items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 font-semibold text-emerald-900">
                {COUNTRY_CODE}
              </span>
              <input
                id="login-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(digitsOnly(e.target.value, PHONE_LENGTH))}
                placeholder="10 digit number"
                maxLength={PHONE_LENGTH}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-otp-error" : undefined}
                className={INPUT}
              />
            </div>
          </div>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send OTP"}
          </PrimaryButton>
        </>
      ) : (
        <>
          <p className="text-sm text-emerald-800/80">
            Enter the 6 digit OTP sent to <span className="font-semibold text-emerald-950">{maskPhone(phone)}</span>
          </p>
          <div>
            <label htmlFor="login-otp" className="text-sm font-semibold text-emerald-950">
              OTP
            </label>
            <input
              id="login-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(digitsOnly(e.target.value, OTP_LENGTH))}
              placeholder="6 digit code"
              maxLength={OTP_LENGTH}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-otp-error" : undefined}
              className={`mt-1.5 tracking-[0.3em] ${INPUT}`}
            />
          </div>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Please wait…" : "Verify & continue"}
          </PrimaryButton>
          <div className="flex items-center justify-between">
            <button type="button" onClick={changeNumber} disabled={busy} className={TEXT_BUTTON}>
              Change number
            </button>
            <button type="button" onClick={requestOtp} disabled={busy || cooldown > 0} className={TEXT_BUTTON}>
              {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
            </button>
          </div>
        </>
      )}

      {error && (
        <p id="login-otp-error" role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {/* Mount point for Firebase's invisible reCAPTCHA. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </form>
  );
}
