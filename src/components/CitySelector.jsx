import { useEffect, useMemo, useRef, useState } from "react";
import { TAP_LINK } from "./buttonStyles";
import {
  COUNTRY,
  getStatesList,
  getDistrictsForState,
  getCitiesForDistrict,
  searchLocations,
} from "../data/indiaLocations";

/**
 * Location picker for the Citizen Home top bar: a button that opens a
 * panel over the full India dataset (data/indiaLocations.js - 28 states,
 * 8 UTs, 598 districts, 528 cities/towns with real coordinates).
 *
 * Two ways to find a place, same panel:
 *  - Type: searches city, district and state names together and lists
 *    matching towns directly (fast path - most people know the town name).
 *  - Browse: no query shows the India -> State -> District -> City tree as
 *    an accordion, for anyone who wants to drill down instead of typing.
 *
 * A district with no town in the coordinate dataset is shown, not hidden
 * (see the HONESTY NOTE in data/indiaLocations.js) - it offers "Add custom
 * location" pre-filled with that state/district instead of guessing a pin.
 *
 * The list still ends with "Add custom location", which is how a citizen
 * gets past the bundled dataset entirely (their own street, campus, a
 * relative's neighbourhood). Custom entries carry a remove control,
 * dataset ones don't.
 */
export default function CitySelector({ city, cities, onSelect, onAddLocation, onRemoveLocation }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedState, setExpandedState] = useState(null);
  const [expandedDistrict, setExpandedDistrict] = useState(null);
  const buttonRef = useRef(null);
  const searchRef = useRef(null);

  const customCities = useMemo(() => cities.filter((c) => c.custom), [cities]);
  const states = useMemo(() => getStatesList(), []);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setExpandedState(null);
    setExpandedDistrict(null);
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const searchResults = useMemo(() => searchLocations(query, 40), [query]);

  const districtsForExpandedState = useMemo(
    () => (expandedState ? getDistrictsForState(expandedState) : []),
    [expandedState]
  );

  const citiesForExpandedDistrict = useMemo(
    () =>
      expandedState && expandedDistrict
        ? getCitiesForDistrict(expandedState, expandedDistrict)
        : [],
    [expandedState, expandedDistrict]
  );

  const pick = (cityId) => {
    onSelect(cityId);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const addForGap = (name, state) => {
    setOpen(false);
    onAddLocation?.({ name, state });
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Location: ${city.name}. Change location`}
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
          <div
            role="dialog"
            aria-label="Choose your location"
            className="absolute left-0 top-full z-30 mt-1 flex max-h-[75vh] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-xl shadow-emerald-950/15 animate-fade-in-up"
          >
            {/* Search */}
            <div className="shrink-0 border-b border-emerald-50 p-2.5">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                </span>
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search city, district or state..."
                  className="w-full rounded-xl border border-emerald-100 bg-emerald-50/40 py-2.5 pl-9 pr-3 text-sm text-emerald-950 placeholder:text-emerald-800/40 focus:border-emerald-400 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Results / browse tree */}
            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {query.trim() ? (
                searchResults.length > 0 ? (
                  searchResults.map((c) => (
                    <CityRow key={c.id} c={c} selected={c.id === city.id} onPick={() => pick(c.id)} />
                  ))
                ) : (
                  <li className="px-4 py-6 text-center text-sm text-emerald-800/50">
                    No match for &ldquo;{query}&rdquo;. Try a different spelling, or add it as a
                    custom location below.
                  </li>
                )
              ) : (
                <>
                  {customCities.length > 0 && (
                    <>
                      <li className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800/40">
                        Your locations
                      </li>
                      {customCities.map((c) => (
                        <CityRow
                          key={c.id}
                          c={c}
                          selected={c.id === city.id}
                          onPick={() => pick(c.id)}
                          onRemove={onRemoveLocation ? () => onRemoveLocation(c.id) : undefined}
                        />
                      ))}
                    </>
                  )}

                  <li className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800/40">
                    {COUNTRY} - browse by state
                  </li>
                  {states.map((s) => {
                    const isExpanded = expandedState === s.id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedDistrict(null);
                            setExpandedState(isExpanded ? null : s.id);
                          }}
                          aria-expanded={isExpanded}
                          className="flex min-h-[40px] w-full items-center justify-between gap-2 px-4 py-1.5 text-left text-sm text-emerald-950 transition hover:bg-emerald-50"
                        >
                          <span className="flex items-center gap-1.5">
                            {s.name}
                            {s.type === "ut" && (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                UT
                              </span>
                            )}
                          </span>
                          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 text-emerald-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>

                        {isExpanded && (
                          <ul className="bg-emerald-50/30 pb-1">
                            {districtsForExpandedState.map((d) => {
                              const dExpanded = expandedDistrict === d.name;
                              const dCities = dExpanded ? citiesForExpandedDistrict : [];
                              return (
                                <li key={d.id}>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedDistrict(dExpanded ? null : d.name)}
                                    aria-expanded={dExpanded}
                                    className="flex min-h-[36px] w-full items-center justify-between gap-2 py-1 pl-7 pr-4 text-left text-[13px] text-emerald-800 transition hover:bg-emerald-50"
                                  >
                                    {d.name}
                                    <svg viewBox="0 0 24 24" className={`h-3 w-3 shrink-0 text-emerald-400 transition-transform ${dExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M6 9l6 6 6-6" />
                                    </svg>
                                  </button>
                                  {dExpanded && (
                                    <ul>
                                      {dCities.length > 0 ? (
                                        dCities.map((c) => (
                                          <li key={c.id}>
                                            <button
                                              type="button"
                                              aria-current={c.id === city.id ? "true" : undefined}
                                              onClick={() => pick(c.id)}
                                              className={`flex min-h-[36px] w-full items-center justify-between gap-2 py-1 pl-11 pr-4 text-left text-[13px] transition hover:bg-emerald-50 ${
                                                c.id === city.id ? "font-semibold text-emerald-800" : "text-emerald-950"
                                              }`}
                                            >
                                              {c.name}
                                              {c.id === city.id && (
                                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                  <path d="M5 12l5 5 9-10" />
                                                </svg>
                                              )}
                                            </button>
                                          </li>
                                        ))
                                      ) : (
                                        <li className="pl-11 pr-4 py-1.5 text-[12px] text-emerald-800/50">
                                          No major town on file for {d.name}.{" "}
                                          {onAddLocation && (
                                            <button
                                              type="button"
                                              onClick={() => addForGap(d.name, s.name)}
                                              className="font-semibold text-emerald-700 underline underline-offset-2"
                                            >
                                              Add it
                                            </button>
                                          )}
                                        </li>
                                      )}
                                    </ul>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </>
              )}
            </ul>

            {onAddLocation && (
              <div className="shrink-0 border-t border-emerald-100">
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
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CityRow({ c, selected, onPick, onRemove }) {
  return (
    <li className="flex items-center">
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onPick}
        className={`flex min-h-[44px] flex-1 items-center justify-between gap-2 py-2 pl-4 pr-2 text-left text-sm transition hover:bg-emerald-50 ${
          selected ? "font-semibold text-emerald-800" : "text-emerald-950"
        }`}
      >
        <span>
          {c.name}
          {(c.district || c.state) && (
            <span className="ml-1.5 text-xs text-emerald-800/50">
              {c.district && c.district !== c.name ? `${c.district}, ` : ""}
              {c.state}
            </span>
          )}
        </span>
        {selected && (
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5 9-10" />
          </svg>
        )}
      </button>

      {c.custom && onRemove && (
        <button
          type="button"
          aria-label={`Remove ${c.name}`}
          onClick={onRemove}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-emerald-800/40 hover:bg-emerald-50 hover:text-red-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </li>
  );
}
