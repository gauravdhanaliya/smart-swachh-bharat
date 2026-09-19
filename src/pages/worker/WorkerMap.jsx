import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import { googleMapsSearchUrl } from "../../components/SimpleMap";
import FacilityMap from "../../components/FacilityMap";
import PriorityBadge from "../../components/PriorityBadge";
import { useComplaints } from "../../hooks/useComplaints";
import { useWorkerSession } from "../../hooks/useWorkerSession";
import { STATUS } from "../../data/complaints";

// FIX — this map previously rendered with SimpleMap, a plain
// OpenStreetMap iframe that can only ever show ONE fixed marker, so
// every task except whichever one was tapped never appeared on the map
// itself. Now backed by FacilityMap (react-leaflet), every active task
// location is plotted as its own colored pin via FacilityMap's generic
// `markers` prop (status-colored, not a real bin/toilet).
const LUCKNOW = { latitude: 26.8467, longitude: 80.9462 };
const CITY_ZOOM = 12;
const SELECTED_ZOOM = 16;

const STATUS_DOT = {
  [STATUS.ASSIGNED]: "#0284c7",
  [STATUS.IN_PROGRESS]: "#e07a00",
};

export default function WorkerMap() {
  const navigate = useNavigate();
  const complaints = useComplaints();
  const { worker } = useWorkerSession();
  const [selectedId, setSelectedId] = useState(null);

  // Only the worker's own active (not-yet-resolved) tasks belong on this map.
  const tasks = useMemo(
    () =>
      complaints.filter(
        (c) =>
          c.assignedWorkerId === worker.id &&
          (c.status === STATUS.ASSIGNED || c.status === STATUS.IN_PROGRESS)
      ),
    [complaints, worker.id]
  );

  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const mapCenter = selected
    ? { latitude: selected.location.latitude, longitude: selected.location.longitude, zoom: SELECTED_ZOOM }
    : { latitude: LUCKNOW.latitude, longitude: LUCKNOW.longitude, zoom: CITY_ZOOM };

  const taskMarkers = useMemo(
    () =>
      tasks.map((task) => ({
        id: task.id,
        latitude: task.location.latitude,
        longitude: task.location.longitude,
        name: `#${task.id} · ${task.issueType}`,
        color: STATUS_DOT[task.status] ?? "#0284c7",
        glyph: "\u{1F9F9}",
      })),
    [tasks]
  );

  return (
    <WorkerShell title="Task Map" noScroll>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-3">
          <FacilityMap
            markers={taskMarkers}
            center={{ latitude: mapCenter.latitude, longitude: mapCenter.longitude }}
            zoom={mapCenter.zoom}
            selectedKind={selectedId ? "marker" : null}
            selectedId={selectedId}
            onSelectMarker={(marker) => setSelectedId(marker.id)}
            className="h-56"
          />

          <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-2 text-xs font-medium text-orange-900 shadow-sm">
            <LegendDot color={STATUS_DOT[STATUS.ASSIGNED]} label="Assigned" />
            <LegendDot color={STATUS_DOT[STATUS.IN_PROGRESS]} label="In Progress" />
          </div>

          {selected && (
            <div className="rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    #{selected.id} · {selected.issueType}
                  </p>
                  <p className="truncate text-xs text-slate-500">{selected.location.address}</p>
                </div>
                <PriorityBadge priority={selected.priority} />
              </div>
              <div className="mt-3 flex gap-2">
                <a
                  href={googleMapsSearchUrl(selected.location.latitude, selected.location.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-full bg-white px-3 py-2 text-center text-xs font-semibold text-orange-700 ring-1 ring-orange-200"
                >
                  Open in Google Maps
                </a>
                <button
                  type="button"
                  onClick={() => navigate(`/worker/tasks/${selected.id}`)}
                  className="flex-1 rounded-full bg-orange-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Open Task
                </button>
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Active Task Locations</h2>
            {tasks.length === 0 && (
              <p className="rounded-2xl bg-white px-4 py-3 text-center text-sm text-orange-900/60 shadow-sm">
                No active task locations to show right now.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedId(task.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-orange-100 bg-white px-3.5 py-3 text-left hover:bg-orange-50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STATUS_DOT[task.status] ?? "#0284c7" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      #{task.id} · {task.issueType}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{task.location.address}</span>
                  </span>
                  <PriorityBadge priority={task.priority} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WorkerShell>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
