import { useEffect, useId, useRef } from "react";

/**
 * Small "are you sure?" modal, styled like RemoveWorkerDialog. Escape or a
 * tap outside cancels; focus starts on Cancel so Enter never confirms a
 * destructive action by accident.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel, danger = false, onConfirm, onCancel }) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef(null);
  // Callers pass a fresh arrow each render; reading it through a ref keeps the
  // effect below from re-running (and pulling focus back to Cancel) every time
  // the parent re-renders while the dialog is open.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onCancelRef.current?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <h2 id={titleId} className="text-base font-bold text-slate-900">
          {title}
        </h2>
        {message && (
          <p id={messageId} className="mt-1 text-sm text-slate-600">
            {message}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 ${ danger ? "bg-red-600 hover:bg-red-700 focus-visible:outline-red-600" : "bg-emerald-700 hover:bg-brand-hover focus-visible:outline-emerald-700" }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
