import Emblem from "./Emblem";

/**
 * Government of India / Ministry header.
 * Shown on the splash screen and can be reused wherever the full
 * ministry attribution is required.
 */
export default function GovHeader({ compact = false }) {
  return (
    <div className="flex flex-col items-center px-6 pt-6 text-center">
      <Emblem className={`${compact ? "h-11 w-11" : "h-16 w-16"} text-emerald-950/85`} />
      <p
        className={`mt-1.5 font-bold text-emerald-950 ${
          compact ? "text-sm" : "text-base"
        }`}
      >
        Government of India
      </p>
      <p className={`text-emerald-900/70 ${compact ? "text-xs" : "text-sm"}`}>
        Ministry of Housing and Urban Affairs
      </p>
    </div>
  );
}
