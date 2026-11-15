import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { WORKER_STATUS_OPTIONS } from "../services/workerService";
import { backdrop, fadeUp } from "../utils/motion";
import { maskEmail, normaliseEmail } from "../../server/src/email.js";

// What is kept of the address, shown as it will be stored: the masked form of
// exactly what was typed (the server masks it the same way).
function privacyNote(typed) {
  const email = normaliseEmail(typed);
  return email
    ? `Stored only as a hash and as ${maskEmail(email)}, never the address.`
    : "Stored only as a hash and a masked copy, never the address.";
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const EMPTY = { name: "", email: "", area: "", status: "Available" };

const field =
  "mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-base text-ink placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand focus:outline-none sm:text-sm aria-[invalid=true]:border-red-400";
const label = "block text-sm font-medium text-slate-700";

/**
 * "Add worker" (Government Official, worker directory): a name and the
 * worker's email. The email becomes a pending worker role, kept only as a
 * hash and a masked copy on the server. Once that person creates an account
 * with the same email and confirms it, they are a Worker.
 *
 * onConfirm(draft) may return a Promise; while it runs the dialog waits, and
 * if it is refused the reason shows here and nothing is lost.
 */
export default function AddWorkerDialog({ onCancel, onConfirm }) {
  const ids = useId();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const savingRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !savingRef.current) onCancelRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    const found = {};
    if (!draft.name.trim()) found.name = "Enter the worker's name.";
    if (!EMAIL_RE.test(draft.email.trim())) found.email = "Enter a valid email address, like name@example.com.";
    setErrors(found);
    if (Object.keys(found).length) return;
    savingRef.current = true;
    setSaving(true);
    setFailure("");
    try {
      await onConfirm({ name: draft.name.trim(), email: draft.email.trim(), area: draft.area.trim(), status: draft.status });
    } catch (err) {
      setFailure(err?.message || "The worker couldn't be added. Please try again.");
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <motion.div {...backdrop(reduced)} className="absolute inset-0 bg-slate-950/50" onClick={() => !savingRef.current && onCancel()} aria-hidden="true" />

      <motion.div
        {...fadeUp(reduced)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-desc`}
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 id={`${ids}-title`} className="text-base font-bold text-ink">
              Add worker
            </h2>
            <p id={`${ids}-desc`} className="mt-0.5 text-sm text-slate-600">
              They become a worker when they create an EcoSetu account with this email and confirm it.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-3.5">
          <div>
            <label className={label} htmlFor={`${ids}-name`}>
              Name
            </label>
            <input
              id={`${ids}-name`}
              type="text"
              autoFocus
              autoComplete="off"
              value={draft.name}
              onChange={set("name")}
              placeholder="e.g. Anita Sharma"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${ids}-name-error` : undefined}
              className={field}
            />
            {errors.name && (
              <p id={`${ids}-name-error`} className="mt-1 text-sm font-medium text-red-700">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label className={label} htmlFor={`${ids}-email`}>
              Email
            </label>
            <input
              id={`${ids}-email`}
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={draft.email}
              onChange={set("email")}
              placeholder="name@example.com"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={`${ids}-email-note`}
              className={field}
            />
            <p id={`${ids}-email-note`} data-email-note className={`mt-1 text-sm ${errors.email ? "font-medium text-red-700" : "text-slate-600"}`}>
              {errors.email || privacyNote(draft.email)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor={`${ids}-area`}>
                Area <span className="font-normal text-muted">(optional)</span>
              </label>
              <input id={`${ids}-area`} type="text" value={draft.area} onChange={set("area")} placeholder="e.g. Main Gate" className={field} />
            </div>
            <div>
              <label className={label} htmlFor={`${ids}-status`}>
                Status
              </label>
              <select id={`${ids}-status`} value={draft.status} onChange={set("status")} className={field}>
                {WORKER_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div aria-live="assertive">
            {failure && (
              <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                {failure}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="min-h-11 flex-1 cursor-pointer rounded-xl border border-line px-4 text-sm font-semibold text-slate-700 hover:bg-section btn-disabled-quiet"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              aria-busy={saving || undefined}
              className="min-h-11 flex-1 cursor-pointer rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover btn-disabled"
            >
              {saving ? "Adding…" : "Add worker"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
