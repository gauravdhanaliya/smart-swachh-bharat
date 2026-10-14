import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import GovShell from "../../components/GovShell";
import StatusFilterTabs from "../../components/StatusFilterTabs";
import RemoveFacilityDialog from "../../components/RemoveFacilityDialog";
import RemovedFacilitiesPanel from "../../components/RemovedFacilitiesPanel";
import { useLiveBuildings } from "../../hooks/useLiveBuildings";
import { useFacilityRemoval } from "../../hooks/useFacilityRemoval";
import { BUILDING_TYPES, BUILDING_TYPE_LABELS } from "../../services/locationAdapters";

const FILTERS = [
  { value: "all", label: "All" },
  ...BUILDING_TYPES.map((t) => ({ value: t, label: BUILDING_TYPE_LABELS[t] })),
];

export default function GovLocations() {
  const navigate = useNavigate();
  const buildings = useLiveBuildings();
  const [filter, setFilter] = useState("all");
  const removal = useFacilityRemoval("building");

  const filtered = useMemo(
    () => (filter === "all" ? buildings : buildings.filter((b) => b.buildingType === filter)),
    [buildings, filter]
  );
  const demoCount = buildings.filter((b) => b.isDemo).length;

  return (
    <GovShell
      title="Campus Buildings"
      subtitle="Buildings, gates, hostels and other places shown on the map"
      actions={
        <>
          <button
            type="button"
            onClick={() => navigate("/official/add-facility?type=Building")}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            + Add Building
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
            {removal.removeMode ? "Done" : "− Remove"}
          </button>
        </>
      }
    >
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">
          {buildings.length} locations · {demoCount} are <span className="font-semibold">DEMO</span> (simulated).
          Replace them with verified coordinates — tap Edit on a card, or see the import steps in server/README.md.
        </p>
        <div className="mt-3">
          <StatusFilterTabs options={FILTERS} value={filter} onChange={setFilter} />
        </div>
      </div>

      {removal.error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {removal.error}
        </p>
      )}

      <RemovedFacilitiesPanel
        category="building"
        removed={removal.removed}
        lastRemoved={removal.lastRemoved}
        onUndo={removal.undoRemove}
        onDismissUndo={removal.dismissUndo}
        onRestore={removal.restore}
        onRestoreAll={removal.restoreAll}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((b) => (
          <div
            key={b.id}
            className={`rounded-2xl border bg-white p-4 shadow-sm ${removal.removeMode ? "border-red-200" : "border-slate-200"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-400">{b.id}</p>
                <p className="font-semibold text-slate-900">
                  {b.icon} {b.name}
                </p>
              </div>
              {b.isDemo && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">DEMO</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{b.typeLabel}</p>
            <p className="mt-1 text-xs text-slate-400">
              {b.latitude.toFixed(6)}, {b.longitude.toFixed(6)}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => navigate(`/official/add-facility?edit=${encodeURIComponent(b.id)}`)}
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
              {removal.removeMode && (
                <button
                  type="button"
                  onClick={() => removal.requestRemove(b)}
                  aria-label={`Remove ${b.name}`}
                  className="flex-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">No locations to show</p>
          <p className="mt-1 text-sm text-slate-500">Try a different filter, or add a building.</p>
        </div>
      )}

      <RemoveFacilityDialog
        facility={removal.pending}
        category="building"
        onCancel={removal.cancelRemove}
        onConfirm={removal.confirmRemove}
      />
    </GovShell>
  );
}
