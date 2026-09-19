import { useNavigate } from "react-router-dom";
import BrandLogo from "./BrandLogo";
import CityIllustration from "./CityIllustration";

function BackButton({ onBack }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={onBack ?? (() => navigate(-1))}
      aria-label="Go back"
      className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 transition hover:bg-emerald-50"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

/**
 * Wraps every auth screen with the mobile device frame, the compact
 * "Smart Swachh Bharat" header, and the footer tagline seen in the
 * reference designs.
 */
export default function ScreenShell({
  children,
  showBack = false,
  onBack,
  footer = "Clean Cities  |  Green Tomorrow",
}) {
  return (
    <div className="min-h-dvh bg-emerald-50/40 sm:py-6">
      <div className="device-frame">
        <div className="flex items-center gap-2 px-5 pt-5">
          {showBack && <BackButton onBack={onBack} />}
          <BrandLogo size="sm" />
        </div>

        <div className="flex-1 flex flex-col px-6 pb-6 pt-4">{children}</div>

        <div className="relative mt-auto">
          <CityIllustration
            variant="subtle"
            className="absolute bottom-8 left-0 w-full opacity-70 pointer-events-none"
          />
          <p className="relative z-10 pb-6 text-center text-xs font-medium text-emerald-700/70">
            {footer}
          </p>
        </div>
      </div>
    </div>
  );
}
