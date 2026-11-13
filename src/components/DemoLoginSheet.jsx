import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RoleIcon } from "./RoleCard";
import { backdrop, sheet } from "../utils/motion";

const DEMO_ROLES = [
  // One short line each: it must fit beside the icon on a 360px screen.
  { id: "citizen", title: "Citizen", description: "Report and track issues" },
  { id: "worker", title: "Sanitation Worker", description: "Your assigned tasks" },
  { id: "official", title: "Government Official", description: "Monitor and manage facilities" },
];

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "Try the demo": a bottom sheet listing the three demo roles. Tapping one
 * signs in as that role's demo user (no name, no phone). Focus moves into
 * the sheet, Tab stays inside it, Escape or the backdrop closes it, and focus
 * goes back to whatever opened it.
 *
 * busyRole: the role being signed in (its row shows progress, the rest wait).
 */
export default function DemoLoginSheet({ open, onClose, onPick, busyRole = null, error = "" }) {
  const reduced = useReducedMotion();
  const ids = useId();
  const panelRef = useRef(null);
  const headingRef = useRef(null);
  const returnFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    returnFocus.current = document.activeElement;
    headingRef.current?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      const inside = items.includes(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const el = returnFocus.current;
      setTimeout(() => el?.isConnected && el.focus?.(), 0);
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center">
          <motion.div {...backdrop(reduced)} className="absolute inset-0 bg-slate-950/50" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={panelRef}
            {...sheet(reduced)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${ids}-title`}
            aria-describedby={`${ids}-desc`}
            className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-4 pt-2.5 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0 pt-1.5">
                <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="text-lg font-bold text-emerald-950 outline-none">
                  Try the demo
                </h2>
                <p id={`${ids}-desc`} className="mt-0.5 text-sm text-emerald-800/80">
                  Sign in as a sample user. No phone number needed; demo data only.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-emerald-900 hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div aria-live="assertive">
              {error && (
                <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                  {error}
                </p>
              )}
            </div>

            <ul className="mt-2 divide-y divide-emerald-100">
              {DEMO_ROLES.map((r) => {
                const busy = busyRole === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onPick(r.id)}
                      disabled={Boolean(busyRole)}
                      aria-busy={busy || undefined}
                      className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] cursor-pointer items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:bg-emerald-100/70 btn-disabled-quiet disabled:cursor-wait"
                    >
                      <RoleIcon id={r.id} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-emerald-950">{r.title}</span>
                        <span data-one-line className="block text-sm leading-snug text-emerald-800/80">
                          {r.description}
                        </span>
                      </span>
                      {busy ? (
                        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700 motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
