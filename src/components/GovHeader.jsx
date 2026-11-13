import Emblem from "./Emblem";

/**
 * Emblem header shown on the splash screen. (No ministry attribution: this
 * is a hackathon prototype, not a government service.)
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
    </div>
  );
}
