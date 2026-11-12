import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import LiveCameraCapture from "./LiveCameraCapture";
import { createFacilityComplaint } from "../services/complaintService";
import { FACILITY_CATEGORIES } from "../../server/src/constants.js";
import { FACILITY_TYPE_LABEL } from "../utils/facility";
import { backdrop, fadeUp, sheet } from "../utils/motion";

const DESCRIPTION_MAX = 500;

function FacilityIcon({ type }) {
  return type === "toilet" ? (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="4.5" r="1.8" />
      <circle cx="17" cy="4.5" r="1.8" />
      <path d="M5 21v-6H4l1.5-6.5h3L10 15H9v6M15 21v-7h-1.5l.8-5.5h4.4l.8 5.5H18v7M12 3v18" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 4h4M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

/**
 * "Report an issue" for one bin or toilet: a bottom sheet with the facility
 * locked at the top, its own categories, an optional description (required
 * for "Other") and an optional live photo. The complaint goes into the normal
 * complaint workflow. A second open report for the same thing shows the open
 * one instead of an error.
 *
 * facility: { id, type: "bin" | "toilet", name, address, latitude, longitude }
 */
export default function ReportFacilitySheet({ facility, open, onClose }) {
  const reduced = useReducedMotion();
  const ids = useId();
  const headingRef = useRef(null);
  const returnFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    returnFocus.current = document.activeElement;
    headingRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const el = returnFocus.current;
      setTimeout(() => el?.isConnected && el.focus?.(), 0);
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && facility && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center">
          <motion.div {...backdrop(reduced)} className="absolute inset-0 bg-slate-950/50" onClick={onClose} aria-hidden="true" />
          <motion.div
            {...sheet(reduced)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${ids}-title`}
            className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
              <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="text-lg font-bold text-emerald-950 outline-none">
                Report an issue
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-emerald-900 hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <LockedFacility facility={facility} />
              <ReportForm facility={facility} onClose={onClose} reduced={reduced} />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// What is being reported, fixed: it comes from the page the sheet was opened on.
function LockedFacility({ facility }) {
  return (
    <div role="group" aria-label="Reporting" className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm">
        <FacilityIcon type={facility.type} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-emerald-950 [overflow-wrap:anywhere]">{facility.name}</p>
        <p className="text-xs font-medium text-emerald-800/80">{`${FACILITY_TYPE_LABEL[facility.type]} · ${facility.id}`}</p>
        {facility.address && <p className="mt-0.5 text-xs text-emerald-800/60 [overflow-wrap:anywhere]">{facility.address}</p>}
      </div>
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-emerald-800 shadow-sm">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
        Locked
      </span>
    </div>
  );
}

function ReportForm({ facility, onClose, reduced }) {
  const navigate = useNavigate();
  const ids = useId();
  const firstCategory = useRef(null);
  const descriptionRef = useRef(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState(null);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [duplicate, setDuplicate] = useState(null); // { id } of the open report

  const categories = Object.keys(FACILITY_CATEGORIES[facility.type] ?? {});
  const needsDescription = category === "Other";

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!category) next.category = "Choose what's wrong.";
    else if (needsDescription && !description.trim()) next.description = 'Please describe the problem when choosing "Other".';
    if (Object.keys(next).length) {
      setErrors(next);
      (next.category ? firstCategory : descriptionRef).current?.focus();
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const complaint = await createFacilityComplaint({
        facility,
        category,
        description: description.trim() || undefined,
        photo: photo?.dataUrl ?? null,
      });
      onClose();
      navigate(`/citizen/complaints/${complaint.id}`, {
        state: { justSubmitted: true, photoWarning: complaint.photoWarning ?? null },
      });
    } catch (err) {
      setSending(false);
      if (err?.status === 409) {
        setDuplicate({ id: err.existingId ?? null });
        return;
      }
      setErrors(err?.fields && Object.keys(err.fields).length ? err.fields : { submit: err?.message || "Your report couldn't be sent. Please try again." });
    }
  };

  if (duplicate) {
    return (
      <motion.div {...fadeUp(reduced)} className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-amber-50 p-5 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-amber-700 shadow-sm">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 12l2 2 4-4" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <h3 className="text-base font-bold text-amber-950">You already reported this</h3>
        <p className="text-sm text-amber-900/80">
          Your report about “{category}” at {facility.name} is still open, so there&apos;s no need to send it again. You&apos;ll be
          notified when it&apos;s updated.
        </p>
        <div className="mt-1 flex w-full flex-col gap-2">
          {duplicate.id && (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/citizen/complaints/${duplicate.id}`);
              }}
              className="min-h-12 cursor-pointer rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-800"
            >
              Open your report
            </button>
          )}
          <button
            type="button"
            onClick={() => setDuplicate(null)}
            className="min-h-11 cursor-pointer rounded-full px-5 text-sm font-semibold text-emerald-800 hover:bg-white"
          >
            Report something else
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-5">
      <fieldset aria-describedby={errors.category ? `${ids}-category-error` : undefined}>
        <legend className="text-sm font-semibold text-emerald-950">
          What&apos;s wrong? <span className="font-normal text-emerald-800/60">(required)</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((c, i) => {
            const on = category === c;
            return (
              <label
                key={c}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500 active:scale-[0.97] ${
                  on ? "border-transparent bg-emerald-700 text-white shadow-md shadow-emerald-900/20" : "border-emerald-200 bg-white text-emerald-900 hover:border-emerald-300"
                }`}
              >
                <input
                  ref={i === 0 ? firstCategory : undefined}
                  type="radio"
                  name={`${ids}-category`}
                  value={c}
                  checked={on}
                  onChange={() => {
                    setCategory(c);
                    setErrors((er) => ({ ...er, category: undefined, description: undefined }));
                  }}
                  className="sr-only"
                />
                {c}
              </label>
            );
          })}
        </div>
        {errors.category && (
          <p id={`${ids}-category-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-600">
            {errors.category}
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor={`${ids}-description`} className="mb-1.5 block text-sm font-semibold text-emerald-950">
          Describe the problem{" "}
          <span className="font-normal text-emerald-800/60">{needsDescription ? "(required for “Other”)" : "(optional)"}</span>
        </label>
        <textarea
          id={`${ids}-description`}
          ref={descriptionRef}
          rows={3}
          maxLength={DESCRIPTION_MAX}
          value={description}
          aria-invalid={errors.description ? "true" : undefined}
          aria-describedby={errors.description ? `${ids}-description-error` : undefined}
          onChange={(e) => {
            setDescription(e.target.value);
            setErrors((er) => ({ ...er, description: undefined }));
          }}
          placeholder="What did you see?"
          className={`w-full resize-none rounded-2xl border bg-white p-3.5 text-base text-emerald-950 placeholder:text-emerald-800/40 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none sm:text-sm ${
            errors.description ? "border-red-400" : "border-emerald-200 focus:border-emerald-500"
          }`}
        />
        <div className="mt-1 flex justify-between gap-2 text-xs">
          {errors.description ? (
            <p id={`${ids}-description-error`} role="alert" className="font-medium text-red-600">
              {errors.description}
            </p>
          ) : (
            <span />
          )}
          <span className="shrink-0 tabular-nums text-emerald-800/60">
            {description.length}/{DESCRIPTION_MAX}
          </span>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-emerald-950">
          Photo <span className="font-normal text-emerald-800/60">(optional, live camera)</span>
        </p>
        <LiveCameraCapture photo={photo} onCapture={(dataUrl) => setPhoto({ dataUrl })} onRetake={() => setPhoto(null)} />
        {errors.photo && (
          <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
            {errors.photo}
          </p>
        )}
      </div>

      {errors.submit && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
          {errors.submit}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="min-h-12 cursor-pointer rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 transition hover:bg-emerald-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
