import { useEffect, useState } from "react";
import { REMOVAL_REASONS } from "../services/facilityService";

// Step 14E — confirmation step for Government "Remove Facility".
// Removal is reversible (Undo / Restore), but it still hides the
// facility from every Citizen screen, so it always goes through an
// explicit confirm + a recorded reason.
const OTHER = "Other (describe below)";

export default function RemoveFacilityDialog({ facility, category, onCancel, onConfirm }) {
  const reasons = REMOVAL_REASONS[category] ?? REMOVAL_REASONS.bin;
  const [reason, setReason] = useState(reasons[0]);
  const [otherReason, setOtherReason] = useState("");

  // Reset the form each time a different facility is targeted.
  useEffect(() => {
    setReason(reasons[0]);
    setOtherReason("");
  }, [facility?.id, reasons]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  if (!facility) return null;

  const isOther = reason === OTHER;
  const finalReason = isOther ? otherReason.trim() : reason;
  const canConfirm = finalReason.length > 0;
  const label = category === "toilet" ? "public toilet" : "dustbin";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/50"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-facility-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 7h12l-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7z" />
              <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M4 7h16" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 id="remove-facility-title" className="text-base font-bold text-slate-900">
              Remove this {label}?
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              It will disappear from the Government list and from the Citizen Bin &amp; Toilet
              Map. You can restore it afterwards.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-400">{facility.id}</p>
          <p className="truncate font-semibold text-slate-900">{facility.name}</p>
          {facility.address && <p className="mt-0.5 truncate text-xs text-slate-500">{facility.address}</p>}
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-slate-900">Reason for removal</legend>
          <div className="mt-2 flex flex-col gap-1.5">
            {[...reasons, OTHER].map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
                  reason === option
                    ? "border-sky-500 bg-sky-50 text-sky-800"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="removal-reason"
                  value={option}
                  checked={reason === option}
                  onChange={() => setReason(option)}
                  className="h-4 w-4 accent-sky-600"
                />
                {option}
              </label>
            ))}
          </div>

          {isOther && (
            <input
              type="text"
              autoFocus
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder="Describe why this facility is being removed"
              aria-label="Other reason"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
            />
          )}
        </fieldset>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(finalReason)}
            className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
