/**
 * "Smart Swachh Bharat" brand lockup — the circular bin-and-swoosh mark
 * beside the stacked three-line wordmark.
 * size: "lg" for the splash screen, "sm" for the compact header used on
 * the inner auth screens.
 */
export default function BrandLogo({ size = "lg" }) {
  const isLarge = size === "lg";

  return (
    <div className={`flex items-center ${isLarge ? "gap-1" : "gap-2.5"}`}>
      <BinMark large={isLarge} />

      {isLarge ? (
        <div className="leading-[0.98] text-left">
          <p className="text-[34px] font-extrabold tracking-tight text-brand-green-800">Smart</p>
          <p className="text-[34px] font-extrabold tracking-tight text-brand-green-500">Swachh</p>
          <p className="text-[34px] font-extrabold tracking-tight text-brand-orange-500">Bharat</p>
        </div>
      ) : (
        <div className="text-left">
          <h1 className="text-[19px] font-extrabold leading-tight tracking-tight">
            <span className="text-brand-green-800">Smart </span>
            <span className="text-brand-green-500">Swachh </span>
            <span className="text-brand-orange-500">Bharat</span>
          </h1>
          <p className="text-xs font-medium leading-tight text-emerald-900/60">
            Ministry of Housing and Urban Affairs
          </p>
        </div>
      )}
    </div>
  );
}

function BinMark({ large }) {
  const dim = large ? "h-28 w-32" : "h-10 w-11";
  return (
    <svg viewBox="0 0 112 100" className={`${dim} shrink-0`} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* orange sweeping arc */}
      <path
        d="M22 76A34 34 0 1 1 78 30"
        fill="none"
        stroke="#f5920e"
        strokeWidth="9"
        strokeLinecap="round"
      />
      {/* green swoosh wrapping the mark */}
      <path
        d="M90 26c7 20 3 42-14 54-15 11-36 10-50-2"
        fill="none"
        stroke="#1f9d55"
        strokeWidth="9"
        strokeLinecap="round"
      />
      {/* orange dot */}
      <circle cx="90" cy="20" r="8" fill="#f5920e" />

      {/* bin */}
      <g transform="translate(33,30)">
        <rect x="11" y="-9" width="16" height="6" rx="2" fill="#0f6e3a" />
        <rect x="-1" y="-4" width="40" height="8" rx="3" fill="#0f6e3a" />
        <path d="M2 6h34l-3 34a4 4 0 0 1-4 3.6H9A4 4 0 0 1 5 40L2 6z" fill="#1f9d55" />
        {/* white leaf roundel */}
        <circle cx="19" cy="24" r="10.5" fill="none" stroke="#ffffff" strokeWidth="2.2" />
        <path
          d="M24 18c1 7-3 12-9 12-1.6 0-2.6-.4-3.4-1 4.4-1.4 7.4-4.6 9-8.6-2.8 3-6 4.8-9.6 5.4.2-4.6 4.6-8 13-7.8z"
          fill="#ffffff"
        />
      </g>

      {/* leaf flourish */}
      <path
        d="M16 86c8-1.6 14-6 17-12-8-1.4-15 2.6-17 12z"
        fill="#4fae74"
      />
    </svg>
  );
}
