import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import PrimaryButton from "../components/PrimaryButton";
import OtpInput from "../components/OtpInput";
import { useAuth } from "../context/AuthContext";

const DEMO_OTP = "123456";
const RESEND_SECONDS = 60;

function formatTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function OtpVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { completeLogin } = useAuth();

  // If the user lands here directly (e.g. page refresh) without a
  // mobile number in state, send them back to enter one.
  const mobile = location.state?.mobile;

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (!mobile) return;
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, mobile]);

  useEffect(() => {
    if (!mobile) {
      navigate("/mobile", { replace: true });
    }
  }, [mobile, navigate]);

  if (!mobile) return null;

  const handleVerify = (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError("Enter the 6-digit OTP.");
      return;
    }
    if (otp !== DEMO_OTP) {
      setError("Incorrect OTP. Please try again. (Hint: use 123456)");
      return;
    }
    completeLogin(mobile);
    navigate("/success");
  };

  const handleResend = () => {
    if (secondsLeft > 0) return;
    setSecondsLeft(RESEND_SECONDS);
    setOtp("");
    setError("");
  };

  return (
    <ScreenShell showBack onBack={() => navigate("/mobile")}>
      <h2 className="mt-6 text-2xl font-bold text-emerald-950">Verify OTP</h2>
      <p className="mt-1 text-sm text-emerald-800/70">
        We have sent a 6-digit OTP to +91 {mobile}
      </p>

      <form onSubmit={handleVerify} className="mt-6 flex flex-col gap-4">
        <OtpInput
          value={otp}
          onChange={(v) => {
            setOtp(v);
            if (error) setError("");
          }}
          error={error}
        />

        <p className="text-sm text-emerald-800/70">
          {secondsLeft > 0 ? (
            <>OTP expires in {formatTime(secondsLeft)}</>
          ) : (
            "OTP expired"
          )}
        </p>

        <PrimaryButton type="submit">Verify</PrimaryButton>

        <p className="text-center text-sm text-emerald-800/70">
          Didn&apos;t receive OTP?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={secondsLeft > 0}
            className="font-semibold text-emerald-700 disabled:text-emerald-300"
          >
            Resend OTP
          </button>
        </p>
      </form>

      <p className="mt-6 text-center text-xs text-emerald-800/40">
        Demo mode — use OTP 123456 to continue.
      </p>
    </ScreenShell>
  );
}
