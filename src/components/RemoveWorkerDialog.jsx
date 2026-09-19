import { useEffect, useState } from "react";

const REMOVAL_REASONS = [
  "No longer with the department",
  "Transferred to another district",
  "Duplicate entry",
  "Added by mistake",
];
const OTHER = "Other (describe below)";

export default function RemoveWorkerDialog({ worker, onCancel, onConfirm }) {
  const [reason, setReason] = useState(REMOVAL_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");

  useEffect(() => {
    setReason(REMOVAL_REASONS[0]);
    setOtherReason("");
  }, [worker?.id]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  if (!worker) return null;

  const isOther = reason === OTHER;
  const finalReason = isOther ? otherReason.trim() : reason;
  const canConfirm = finalReason.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onCancel} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-worker-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 11h-6" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 id="remove-worker-title" className="text-base font-bold text-slate-900">
              Remove {worker.name}?
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              They&apos;ll disappear from the Workers directory. You can restore them afterwards.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-400">{worker.displayId}</p>
          <p className="truncate font-semibold text-slate-900">{worker.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {worker.role} · {worker.area}
          </p>
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-slate-900">Reason for removal</legend>
          <div className="mt-2 flex flex-col gap-1.5">
            {[...REMOVAL_REASONS, OTHER].map((option) => (
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
                  name="worker-removal-reason"
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
              placeholder="Describe why this worker is being removed"
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
