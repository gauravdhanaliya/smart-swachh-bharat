import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import GovShell from "../../components/GovShell";
import GovKpiCard from "../../components/GovKpiCard";
import GovComplaintsList from "../../components/GovComplaintsList";
import StatusFilterTabs from "../../components/StatusFilterTabs";
import FacilityMap from "../../components/FacilityMap";
import { PIN_PADDING } from "../../components/MapPreview";
import { googleMapsSearchUrl } from "../../components/SimpleMap";
import { useComplaints } from "../../hooks/useComplaints";
import { useLiveBins } from "../../hooks/useLiveBins";
import { useLiveToilets } from "../../hooks/useLiveToilets";
import { useGovProfile } from "../../hooks/useGovProfile";
import { getGovJurisdictionCenter } from "../../services/govProfileService";
import { STATUS } from "../../data/complaints";
import { BIN_STATUS_LABELS } from "../../data/bins";
import { computeComplaintStats, computeBinStats } from "../../utils/govStats";

const FILTERS = [
  { value: "all", label: "All" },
  { value: STATUS.SUBMITTED, label: "Submitted" },
  { value: STATUS.ASSIGNED, label: "Assigned" },
  { value: STATUS.IN_PROGRESS, label: "In Progress" },
  { value: STATUS.RESOLVED, label: "Resolved" },
];

// Fallback map center if the officer's chosen district (Profile page)
// isn't one getGovJurisdictionCenter() has coordinates for.
const LUCKNOW_CENTER = { latitude: 26.8467, longitude: 80.9462 };
const CITY_ZOOM = 12;
const SELECTED_ZOOM = 16;

const BIN_STATUS_STYLE = {
  normal: { color: "#16a34a", label: "Normal" },
  almost_full: { color: "#f59e0b", label: "Almost Full" },
  overflow: { color: "#dc2626", label: "Overflow" },
};

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// One row of the bin status overview: how many bins are in this status.
function StatusCountRow({ color, label, value }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-section px-3.5 py-2.5 text-sm">
      <span className="flex items-center gap-2 font-medium text-slate-700">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span>{label}</span>
      </span>
      <span className="font-semibold text-ink">
        {value} {value === 1 ? "bin" : "bins"}
      </span>
    </div>
  );
}

export default function GovDashboard() {
  const navigate = useNavigate();
  const complaints = useComplaints();
  const bins = useLiveBins();
  const toilets = useLiveToilets();
  const { profile } = useGovProfile();
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null); // { kind: "bin" | "toilet", id, data }

  const complaintStats = useMemo(() => computeComplaintStats(complaints), [complaints]);
  const binStats = useMemo(() => computeBinStats(bins), [bins]);

  const filtered = useMemo(() => {
    if (filter === "all") return complaints;
    return complaints.filter((c) => c.status === filter);
  }, [complaints, filter]);

  const recent = filtered.slice(0, 8);

  const jurisdictionCenter = useMemo(() => getGovJurisdictionCenter() ?? LUCKNOW_CENTER, [profile.district, profile.state]);
  const mapCenter = selected ? { latitude: selected.data.latitude, longitude: selected.data.longitude } : jurisdictionCenter;
  const mapZoom = selected ? SELECTED_ZOOM : CITY_ZOOM;
  // Frame every bin and toilet (same padding as the citizen Home preview); the
  // district centre is only the fallback when there are none. A selected pin
  // takes over (centres on it) until it's closed.
  const facilityPoints = useMemo(() => [...bins, ...toilets].filter((p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude)), [bins, toilets]);

  return (
    <GovShell title="Dashboard" subtitle={`Waste and sanitation in ${profile.district} district`}>
      {/* Compact tiles, two per row on a phone; the odd last one spans the row (no gap). */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <GovKpiCard icon="reports" value={complaintStats.total} label="Complaints" dense />
        <GovKpiCard icon="inbox" value={complaintStats.submitted} label="New" tone="new" dense />
        <GovKpiCard icon="user" value={complaintStats.assigned} label="Assigned" tone="new" dense />
        <GovKpiCard icon="clock" value={complaintStats.inProgress} label="In progress" tone="progress" dense />
        <GovKpiCard icon="check" value={complaintStats.resolved} label="Resolved" tone="done" dense />
        <GovKpiCard icon="alert" value={binStats.overflowing} label="Overflowing" sublabel={`of ${binStats.total}`} tone="alert" dense />
        <GovKpiCard icon="toilet" value={complaintStats.toiletIssues} label="Toilet issues" tone="progress" wide dense />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:p-5 lg:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-ink">Live Bin &amp; Toilet Status Map</h2>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-muted">
              <LegendDot color={BIN_STATUS_STYLE.normal.color} label="Normal" />
              <LegendDot color={BIN_STATUS_STYLE.almost_full.color} label="Almost Full" />
              <LegendDot color={BIN_STATUS_STYLE.overflow.color} label="Overflow" />
            </div>
          </div>

          <div data-gov-map>
            <FacilityMap
              bins={bins}
              toilets={toilets}
              center={mapCenter}
              zoom={mapZoom}
              fitTo={selected ? null : facilityPoints}
              fitPadding={PIN_PADDING}
              selectedKind={selected?.kind ?? null}
              selectedId={selected?.id ?? null}
              onSelectBin={(bin) => setSelected({ kind: "bin", id: bin.id, data: bin })}
              onSelectToilet={(toilet) => setSelected({ kind: "toilet", id: toilet.id, data: toilet })}
              className="h-72 sm:h-80"
            />
          </div>

          {selected ? (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-section px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{selected.data.name}</p>
                <p className="truncate text-xs text-muted">{selected.data.address}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={googleMapsSearchUrl(selected.data.latitude, selected.data.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                >
                  Open in Maps
                </a>
                <button
                  type="button"
                  onClick={() => navigate(selected.kind === "bin" ? "/official/bins" : "/official/toilets")}
                  className="rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {selected.kind === "bin" ? "View Bins" : "View Toilets"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">Tap a pin to see its details.</p>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
          <h2 className="text-base font-bold text-ink">Bin Status Overview</h2>
          <div className="flex flex-col gap-3">
            <StatusCountRow color={BIN_STATUS_STYLE.normal.color} label={BIN_STATUS_LABELS.normal} value={binStats.normal} />
            <StatusCountRow color={BIN_STATUS_STYLE.almost_full.color} label={BIN_STATUS_LABELS.almost_full} value={binStats.almostFull} />
            <StatusCountRow color={BIN_STATUS_STYLE.overflow.color} label={BIN_STATUS_LABELS.overflow} value={binStats.overflowing} />
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
            <span>{binStats.total} Total Bins</span>
            <button type="button" onClick={() => navigate("/official/bins")} className="font-semibold text-brand">
              View All →
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold text-ink">Recent Complaints</h2>
          <StatusFilterTabs options={FILTERS} value={filter} onChange={setFilter} />
        </div>

        <GovComplaintsList complaints={recent} />
      </div>
    </GovShell>
  );
}
