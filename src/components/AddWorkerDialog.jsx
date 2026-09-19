import { useEffect, useState } from "react";
import { WORKER_STATUS_OPTIONS } from "../services/workerService";

const EMPTY = { name: "", role: "Sanitation Worker", area: "", phone: "", status: "Available" };

const field =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none";

export default function AddWorkerDialog({ onCancel, onConfirm }) {
  const [draft, setDraft] = useState(EMPTY);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const canConfirm = draft.name.trim().length > 0 && draft.area.trim().length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canConfirm) return;
    onConfirm(draft);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onCancel} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-worker-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 id="add-worker-title" className="text-base font-bold text-slate-900">
              Add a worker
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Added to the field staff directory right away.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-500" htmlFor="worker-name">
              Name
            </label>
            <input
              id="worker-name"
              type="text"
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Anita Sharma"
              className={field}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500" htmlFor="worker-role">
              Role
            </label>
            <input
              id="worker-role"
              type="text"
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
              placeholder="e.g. Sanitation Worker"
              className={field}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500" htmlFor="worker-area">
              Area
            </label>
            <input
              id="worker-area"
              type="text"
              value={draft.area}
              onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))}
              placeholder="e.g. Gomti Nagar"
              className={field}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500" htmlFor="worker-status">
                Status
              </label>
              <select
                id="worker-status"
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                className={field}
              >
                {WORKER_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500" htmlFor="worker-phone">
                Phone (optional)
              </label>
              <input
                id="worker-phone"
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                placeholder="+91 98XXXXXXXX"
                className={field}
              />
            </div>
          </div>

          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canConfirm}
              className="flex-1 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
            >
              Add worker
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
