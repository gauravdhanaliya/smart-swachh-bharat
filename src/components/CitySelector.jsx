import { useEffect, useRef, useState } from "react";
import { TAP_LINK } from "./buttonStyles";

/**
 * City picker for the Citizen Home top bar: a button that opens a small
 * listbox. Closes on selection, outside tap, or Escape (focus returns to
 * the button).
 *
 * The list ends with "Add custom location", which is how a citizen gets
 * past the six built-in cities in data/cities.js. Custom entries carry a
 * remove control, built-in ones don't — deleting a seeded city would
 * break the demo dataset it anchors.
 */
export default function CitySelector({ city, cities, onSelect, onAddLocation, onRemoveLocation }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`City: ${city.name}. Change city`}
        className={`-ml-3 gap-1 ${TAP_LINK}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        {city.name}
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul
            aria-label="Choose your city"
            className="absolute left-0 top-full z-30 mt-1 max-h-72 w-60 overflow-y-auto rounded-2xl border border-emerald-100 bg-white py-1 shadow-xl shadow-emerald-950/15 animate-fade-in-up"
          >
            {cities.map((c) => {
              const selected = c.id === city.id;
              return (
                <li key={c.id} className="flex items-center">
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      onSelect(c.id);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className={`flex min-h-[44px] flex-1 items-center justify-between gap-2 py-2 pl-4 pr-2 text-left text-sm transition hover:bg-emerald-50 ${
                      selected ? "font-semibold text-emerald-800" : "text-emerald-950"
                    }`}
                  >
                    <span>
                      {c.name}
                      {c.state && <span className="ml-1.5 text-xs text-emerald-800/50">{c.state}</span>}
                    </span>
                    {selected && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    )}
                  </button>

                  {c.custom && onRemoveLocation && (
                    <button
                      type="button"
                      aria-label={`Remove ${c.name}`}
                      onClick={() => onRemoveLocation(c.id)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-emerald-800/40 hover:bg-emerald-50 hover:text-red-600"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}

            {onAddLocation && (
              <li className="border-t border-emerald-100">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAddLocation();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add custom location
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
