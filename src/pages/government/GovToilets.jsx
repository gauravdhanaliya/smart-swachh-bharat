import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import GovShell from "../../components/GovShell";
import StatusBadge from "../../components/StatusBadge";
import StatusFilterTabs from "../../components/StatusFilterTabs";
import RemoveFacilityDialog from "../../components/RemoveFacilityDialog";
import RemovedFacilitiesPanel from "../../components/RemovedFacilitiesPanel";
import RatingStars from "../../components/RatingStars";
import { useLiveToilets } from "../../hooks/useLiveToilets";
import { useFacilityRemoval } from "../../hooks/useFacilityRemoval";
import { useRatingSummaries } from "../../hooks/useRatingSummaries";
import { LOW_RATED_BELOW, LOW_RATED_MIN_COUNT, formatAverage, isLowRated, ratingCountLabel } from "../../utils/ratings";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "maintenance", label: "Maintenance" },
];

const SORTS = [
  { value: "default", label: "Default order" },
  { value: "rating-desc", label: "Rating: highest first" },
  { value: "rating-asc", label: "Rating: lowest first" },
];

// Unrated toilets go last whichever way the list is sorted; ties: more ratings first.
function byRating(ratings, direction) {
  return (a, b) => {
    const ra = ratings.get(a.id);
    const rb = ratings.get(b.id);
    const va = ra?.count ? ra.average : null;
    const vb = rb?.count ? rb.average : null;
    if (va === null || vb === null) return (va === null) - (vb === null);
    return direction * (va - vb) || rb.count - ra.count;
  };
}

// Citizens' average rating, the number of ratings, and a "Low rated" tag.
function ToiletRating({ summary }) {
  if (!summary?.count) return <p className="mt-2 text-xs text-slate-400">No ratings yet</p>;
  const low = isLowRated(summary);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <RatingStars value={summary.average} className="h-4 w-4" />
      <span className="font-semibold tabular-nums text-slate-900">{formatAverage(summary.average)}</span>
      <span className="text-xs text-slate-500">{ratingCountLabel(summary.count)}</span>
      {low && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Low rated</span>}
    </div>
  );
}

export default function GovToilets() {
  const navigate = useNavigate();
  const toilets = useLiveToilets();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("default");
  const removal = useFacilityRemoval("toilet");
  const ratings = useRatingSummaries(toilets.map((t) => t.id));

  const lowCount = toilets.filter((t) => isLowRated(ratings.get(t.id))).length;
  const filters = [...STATUS_FILTERS, { value: "low", label: "Low rated", count: lowCount }];

  const filtered = useMemo(() => {
    const list =
      filter === "all"
        ? toilets
        : filter === "low"
          ? toilets.filter((t) => isLowRated(ratings.get(t.id)))
          : toilets.filter((t) => t.status.toLowerCase() === filter);
    if (sort === "default") return list;
    return [...list].sort(byRating(ratings, sort === "rating-asc" ? 1 : -1));
  }, [toilets, filter, sort, ratings]);

  return (
    <GovShell
      title="Public Toilets"
      subtitle="City-wide public toilet status"
      actions={
        <>
          <button
            type="button"
            onClick={() => navigate("/official/add-facility?type=Public+Toilet")}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            + Add Facility
          </button>
          <button
            type="button"
            onClick={removal.toggleRemoveMode}
            aria-pressed={removal.removeMode}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition ${
              removal.removeMode
                ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                : "border-red-200 bg-white text-red-600 hover:bg-red-50"
            }`}
          >
            {removal.removeMode ? "Done" : "− Remove Facility"}
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-slate-500">{toilets.length} facilities tracked</p>
        <div className="flex flex-col gap-3 lg:items-end">
          <StatusFilterTabs options={filters} value={filter} onChange={setFilter} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="min-h-10 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filter === "low" && (
        <p className="mb-4 text-sm text-slate-500">
          Toilets averaging below {LOW_RATED_BELOW} stars from at least {LOW_RATED_MIN_COUNT} citizen ratings.
        </p>
      )}

      {removal.removeMode && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Remove mode is on.</span> Pick the public toilet you
          want to take off the map. You&apos;ll be asked to confirm, and you can restore it
          afterwards.
        </div>
      )}

      {removal.error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {removal.error}
        </p>
      )}

      <RemovedFacilitiesPanel
        category="toilet"
        removed={removal.removed}
        lastRemoved={removal.lastRemoved}
        onUndo={removal.undoRemove}
        onDismissUndo={removal.dismissUndo}
        onRestore={removal.restore}
        onRestoreAll={removal.restoreAll}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((t) => (
          <article
            key={t.id}
            className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
              removal.removeMode ? "border-red-200" : "border-slate-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-400">{t.id}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="font-semibold text-slate-900">{t.name}</h3>
                  {t.isDemo && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">DEMO</span>
                  )}
                </div>
              </div>
              <StatusBadge status={t.status} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{t.address}</p>
            <ToiletRating summary={ratings.get(t.id)} />
            <p className="mt-2 text-xs text-slate-500">
              Facilities: <span className="font-medium text-slate-700">{t.facilities.join(", ")}</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">Updated {t.lastUpdated}</p>

            <button
              type="button"
              onClick={() => navigate(`/official/add-facility?edit=${encodeURIComponent(t.id)}`)}
              className="mt-3 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>

            {removal.removeMode && (
              <button
                type="button"
                onClick={() => removal.requestRemove(t)}
                aria-label={`Remove ${t.name}`}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 7h12l-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7z" />
                  <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M4 7h16" />
                </svg>
                Remove
              </button>
            )}
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">No public toilets to show</p>
          <p className="mt-1 text-sm text-slate-500">
            {filter === "low" ? "No toilet is rated low right now." : "Try a different filter, or add a facility to get started."}
          </p>
        </div>
      )}

      <RemoveFacilityDialog
        facility={removal.pending}
        category="toilet"
        onCancel={removal.cancelRemove}
        onConfirm={removal.confirmRemove}
      />
    </GovShell>
  );
}
