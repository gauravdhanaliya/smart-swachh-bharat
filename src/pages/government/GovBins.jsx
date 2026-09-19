import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import GovShell from "../../components/GovShell";
import StatusBadge from "../../components/StatusBadge";
import StatusFilterTabs from "../../components/StatusFilterTabs";
import FillChart from "../../components/FillChart";
import RemoveFacilityDialog from "../../components/RemoveFacilityDialog";
import RemovedFacilitiesPanel from "../../components/RemovedFacilitiesPanel";
import { useLiveBins } from "../../hooks/useLiveBins";
import { useFacilityRemoval } from "../../hooks/useFacilityRemoval";
import { BIN_STATUS } from "../../data/bins";

const FILTERS = [
  { value: "all", label: "All" },
  { value: BIN_STATUS.NORMAL, label: "Normal" },
  { value: BIN_STATUS.ALMOST_FULL, label: "Almost Full" },
  { value: BIN_STATUS.OVERFLOW, label: "Overflow" },
];

export default function GovBins() {
  const navigate = useNavigate();
  const bins = useLiveBins();
  const [filter, setFilter] = useState("all");
  const removal = useFacilityRemoval("bin");

  const filtered = useMemo(
    () => (filter === "all" ? bins : bins.filter((b) => b.status === filter)),
    [bins, filter]
  );

  return (
    <GovShell
      title="Bins"
      subtitle="City-wide waste bin status"
      actions={
        <>
          <button
            type="button"
            onClick={() => navigate("/official/add-facility?type=Dustbin")}
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
            {removal.removeMode ? "Done" : "\u2212 Remove Facility"}
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {bins.length} bins tracked &middot; {bins.filter((b) => b.status === BIN_STATUS.OVERFLOW).length} overflowing
        </p>
        <StatusFilterTabs options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {removal.removeMode && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Remove mode is on.</span> Pick the dustbin you want to
          take off the map. You&apos;ll be asked to confirm, and you can restore it afterwards.
        </div>
      )}

      <RemovedFacilitiesPanel
        category="bin"
        removed={removal.removed}
        lastRemoved={removal.lastRemoved}
        onUndo={removal.undoRemove}
        onDismissUndo={removal.dismissUndo}
        onRestore={removal.restore}
        onRestoreAll={removal.restoreAll}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((bin) => (
          <div
            key={bin.id}
            className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
              removal.removeMode ? "border-red-200" : "border-slate-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-400">{bin.id}</p>
                <p className="font-semibold text-slate-900">{bin.name}</p>
              </div>
              <StatusBadge status={bin.status} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{bin.address}</p>
            <p className="mt-1 text-xs font-medium text-slate-600">{bin.type}</p>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-2xl font-bold text-slate-900">{bin.fillLevel}%</span>
              <span className="text-xs text-slate-400">Updated {bin.lastUpdated}</span>
            </div>
            <FillChart history={bin.history} className="mt-2 h-16 w-full" />

            {removal.removeMode && (
              <button
                type="button"
                onClick={() => removal.requestRemove(bin)}
                aria-label={`Remove ${bin.name}`}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 7h12l-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7z" />
                  <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M4 7h16" />
                </svg>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">No bins to show</p>
          <p className="mt-1 text-sm text-slate-500">
            Try a different filter, or add a facility to get started.
          </p>
        </div>
      )}

      <RemoveFacilityDialog
        facility={removal.pending}
        category="bin"
        onCancel={removal.cancelRemove}
        onConfirm={removal.confirmRemove}
      />
    </GovShell>
  );
}
