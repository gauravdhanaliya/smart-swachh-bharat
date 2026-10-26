import { useEffect, useRef } from "react";

const THEMES = {
  emerald: {
    card: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
    title: "text-emerald-950",
    body: "text-emerald-900/80",
    primary: "bg-emerald-700 text-white",
    secondary: "border border-emerald-200 bg-white text-emerald-700",
  },
  orange: {
    card: "border-orange-200 bg-orange-50/60 text-slate-900",
    title: "text-slate-900",
    body: "text-slate-700",
    primary: "bg-orange-600 text-white",
    secondary: "border border-orange-200 bg-white text-orange-700",
  },
};

const POINTS = [
  "Your device's GPS will be used to fetch your current location.",
  "It is used only to tag this request or report, and is shared with the government and worker roles handling it.",
  "Accuracy depends on your device, so check the pin or area before you submit.",
  "You can decline location access. Entering a known area or coordinates by hand always remains available.",
];

/**
 * Shown when the user taps an "auto fetch my location" control, before the
 * browser's own permission prompt. "Allow and fetch location" proceeds to GPS;
 * "Enter manually" leaves GPS alone. Focus moves to the primary button when
 * it opens, and Escape counts as "Enter manually".
 */
export default function GpsConsentNotice({ onAllow, onManual, theme = "emerald", className = "" }) {
  const t = THEMES[theme] ?? THEMES.emerald;
  const allowRef = useRef(null);

  useEffect(() => {
    allowRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-labelledby="gps-consent-title"
      aria-describedby="gps-consent-body"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation(); // don't also close a surrounding sheet
          onManual();
        }
      }}
      className={`rounded-2xl border p-3.5 ${t.card} ${className}`}
    >
      <p id="gps-consent-title" className={`text-sm font-bold ${t.title}`}>
        Use your GPS location?
      </p>
      <ul id="gps-consent-body" className={`mt-2 list-disc space-y-1 pl-4 text-xs leading-snug ${t.body}`}>
        {POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          ref={allowRef}
          type="button"
          onClick={onAllow}
          className={`min-h-[44px] flex-1 rounded-full px-4 py-2.5 text-sm font-semibold ${t.primary}`}
        >
          Allow and fetch location
        </button>
        <button
          type="button"
          onClick={onManual}
          className={`min-h-[44px] flex-1 rounded-full px-4 py-2.5 text-sm font-semibold ${t.secondary}`}
        >
          Enter manually
        </button>
      </div>
    </div>
  );
}

/** Inline warning/error for GPS problems; announced to screen readers. */
export function GpsAlert({ children, tone = "warn", className = "" }) {
  const styles = tone === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800";
  return (
    <div role="alert" className={`rounded-xl px-3 py-2 text-xs font-medium ${styles} ${className}`}>
      {children}
    </div>
  );
}
