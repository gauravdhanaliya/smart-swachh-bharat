import { useState } from "react";

// Step 14E — what Government sees after removing a facility.
//
// Two parts, both deliberately non-destructive:
//   1. an Undo bar for the removal that just happened, and
//   2. a collapsed audit list of everything currently removed, with a
//      Restore on each row.
// Because removals are tombstones (see services/facilityService.js),
// Restore always works — including for seeded demo facilities, which
// matters during a live SIH demo where a wrong click shouldn't
// permanently break the dataset.

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RemovedFacilitiesPanel({
  category,
  removed,
  lastRemoved,
  onUndo,
  onDismissUndo,
  onRestore,
  onRestoreAll,
}) {
  const [open, setOpen] = useState(false);
  const noun = category === "toilet" ? "public toilet" : "dustbin";
  const plural = category === "toilet" ? "public toilets" : "dustbins";

  if (!removed.length && !lastRemoved) return null;

  return (
    <div className="mb-4 flex flex-col gap-3">
      {lastRemoved && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-900">
            <span className="font-semibold">{lastRemoved.name}</span> removed.
            <span className="text-amber-700"> It is no longer visible to citizens.</span>
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onUndo}
              className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={onDismissUndo}
              aria-label="Dismiss"
              className="rounded-full border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {removed.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="text-sm font-semibold text-slate-700">
              Removed {plural}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                {removed.length}
              </span>
            </span>
            <span className="text-xs font-medium text-slate-400">
              {open ? "Hide" : "Show"}
            </span>
          </button>

          {open && (
            <div className="border-t border-slate-100 px-4 py-3">
              <ul className="flex flex-col divide-y divide-slate-100">
                {removed.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-400">{item.id}</p>
                      <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {item.reason}
                        {formatWhen(item.removedAt) && ` · ${formatWhen(item.removedAt)}`}
                        {item.removedBy && ` · ${item.removedBy}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRestore(item.id)}
                      className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>

              {removed.length > 1 && (
                <button
                  type="button"
                  onClick={onRestoreAll}
                  className="mt-3 text-xs font-semibold text-sky-700 hover:underline"
                >
                  Restore all {removed.length} removed {plural}
                </button>
              )}
              <p className="mt-2 text-[11px] text-slate-400">
                Restoring puts the {noun} back on the Government list and the Citizen map
                immediately.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
