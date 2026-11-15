import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { backdrop, sheet } from "../utils/motion";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal bottom sheet (a centred card on wider screens). Focus moves to the
 * title when it opens, Tab stays inside, Escape or the backdrop closes it,
 * and focus goes back to whatever opened it. With reduced motion it only
 * fades. `titleKey` re-focuses the title when the content changes (a new view).
 */
export default function BottomSheet({ open, onClose, title, description, titleKey, children, label }) {
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

  // A new view in the same sheet: move focus to its title (screen readers hear the change).
  useEffect(() => {
    if (open && titleKey !== undefined) headingRef.current?.focus();
  }, [open, titleKey]);

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
            aria-label={label}
            aria-labelledby={label ? undefined : `${ids}-title`}
            aria-describedby={description ? `${ids}-desc` : undefined}
            className="relative max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-white px-4 pt-2.5 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0 pt-1.5">
                <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="text-lg font-bold text-emerald-950 outline-none">
                  {title}
                </h2>
                {description && (
                  <p id={`${ids}-desc`} className="mt-0.5 text-sm text-emerald-800/80">
                    {description}
                  </p>
                )}
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
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
