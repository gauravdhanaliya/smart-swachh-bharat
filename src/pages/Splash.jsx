import { useNavigate } from "react-router-dom";
import GovHeader from "../components/GovHeader";
import BrandLogo from "../components/BrandLogo";
import TaglineStrip from "../components/TaglineStrip";
import CityIllustration from "../components/CityIllustration";
import ArrowButton from "../components/ArrowButton";

export default function Splash() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-emerald-50/40 sm:py-4">
      <div className="device-frame device-frame--app relative overflow-hidden">
        {/* soft background flourishes */}
        <div className="pointer-events-none absolute inset-0 -z-0">
          <div className="absolute -left-16 top-24 h-48 w-48 rounded-full bg-emerald-100/50 blur-2xl" />
          <div className="absolute -right-12 top-8 h-40 w-40 rounded-full bg-emerald-100/40 blur-2xl" />
          <svg viewBox="0 0 24 24" className="absolute right-8 top-56 h-6 w-6 text-emerald-300/80" fill="currentColor" aria-hidden="true">
            <path d="M20 4c1 12-5 17-12 17-1.8 0-3-.5-4-1.2 5.6-1.8 9.6-5.8 11.6-11-3.6 4-8 6.4-13 7 .4-7 6.6-12.4 17.4-11.8z" />
          </svg>
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <GovHeader />

          <div className="mt-5 flex flex-col items-center px-5">
            <BrandLogo size="lg" />
            <TaglineStrip className="mt-3" />
          </div>

          <p className="mt-6 px-8 text-center text-[19px] font-bold leading-snug text-emerald-950">
            Let&apos;s build cleaner, healthier
            <br />
            and sustainable cities together
          </p>

          {/* leaf divider */}
          <div className="mt-4 flex items-center justify-center gap-3 px-16">
            <span className="h-px flex-1 bg-emerald-200" />
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-600" fill="currentColor" aria-hidden="true">
              <path d="M20 4c1 12-5 17-12 17-1.8 0-3-.5-4-1.2 5.6-1.8 9.6-5.8 11.6-11-3.6 4-8 6.4-13 7 .4-7 6.6-12.4 17.4-11.8z" />
            </svg>
            <span className="h-px flex-1 bg-emerald-200" />
          </div>

          <div className="mt-4 flex flex-1 items-end">
            <CityIllustration className="w-full" />
          </div>

          <div className="px-4 pb-5">
            <div className="rounded-3xl bg-white px-5 pb-5 pt-5 shadow-[0_-10px_30px_-18px_rgba(15,110,58,0.45)] ring-1 ring-emerald-50">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l7.5 3v6c0 4.6-3.1 8.2-7.5 9.4C7.6 20.2 4.5 16.6 4.5 12V6L12 3z" />
                    <path d="M9 12.2l2.2 2.2L15 10.6" />
                  </svg>
                </span>
                <div className="flex-1">
                  <p className="font-bold text-emerald-950">Together for a Cleaner Tomorrow</p>
                  <p className="text-sm leading-snug text-emerald-800/70">
                    Your small action today can create a big impact.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-700" />
                  <span className="h-2 w-2 rounded-full bg-emerald-200" />
                  <span className="h-2 w-2 rounded-full bg-emerald-200" />
                </div>
                <ArrowButton onClick={() => navigate("/login")} ariaLabel="Continue to login" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
