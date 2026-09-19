import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import GovShell from "../../components/GovShell";
import GovKpiCard from "../../components/GovKpiCard";
import GovComplaintsList from "../../components/GovComplaintsList";
import StatusFilterTabs from "../../components/StatusFilterTabs";
import FacilityMap from "../../components/FacilityMap";
import { googleMapsSearchUrl } from "../../components/SimpleMap";
import { GovNavIcons } from "../../components/GovNavIcons";
import { useComplaints } from "../../hooks/useComplaints";
import { useLiveBins } from "../../hooks/useLiveBins";
import { useLiveToilets } from "../../hooks/useLiveToilets";
import { useGovProfile } from "../../hooks/useGovProfile";
import { getGovJurisdictionCenter } from "../../services/govProfileService";
import { STATUS } from "../../data/complaints";
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

function FillBar({ color, label, value, total }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="text-slate-400">
          {value} · {pct}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
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

  const jurisdictionCenter = useMemo(
    () => getGovJurisdictionCenter() ?? LUCKNOW_CENTER,
    [profile.district, profile.state]
  );
  const mapCenter = selected
    ? { latitude: selected.data.latitude, longitude: selected.data.longitude }
    : jurisdictionCenter;
  const mapZoom = selected ? SELECTED_ZOOM : CITY_ZOOM;

  return (
    <GovShell
      title="Dashboard"
      subtitle={`Overview of Waste Management & Sanitation Activities — ${profile.district} District`}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <GovKpiCard
          icon={GovNavIcons.complaints}
          value={complaintStats.total}
          label="Total Complaints"
          color="slate"
        />
        <GovKpiCard
          icon={GovNavIcons.notifications}
          value={complaintStats.submitted}
          label="New / Submitted"
          color="sky"
        />
        <GovKpiCard
          icon={GovNavIcons.workers}
          value={complaintStats.assigned}
          label="Assigned"
          color="sky"
        />
        <GovKpiCard
          icon={GovNavIcons.analytics}
          value={complaintStats.inProgress}
          label="In Progress"
          color="orange"
        />
        <GovKpiCard
          icon={GovNavIcons.dashboard}
          value={complaintStats.resolved}
          label="Resolved"
          color="emerald"
        />
        <GovKpiCard
          icon={GovNavIcons.bins}
          value={binStats.overflowing}
          label="Overflowing Bins"
          sublabel={`${binStats.total} bins tracked`}
          color="red"
        />
        <GovKpiCard
          icon={GovNavIcons.toilets}
          value={complaintStats.toiletIssues}
          label="Public Toilet Issues"
          color="orange"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-slate-900">Live Bin &amp; Toilet Status Map</h2>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500">
              <LegendDot color={BIN_STATUS_STYLE.normal.color} label="Normal" />
              <LegendDot color={BIN_STATUS_STYLE.almost_full.color} label="Almost Full" />
              <LegendDot color={BIN_STATUS_STYLE.overflow.color} label="Overflow" />
            </div>
          </div>

          <FacilityMap
            bins={bins}
            toilets={toilets}
            center={mapCenter}
            zoom={mapZoom}
            selectedKind={selected?.kind ?? null}
            selectedId={selected?.id ?? null}
            onSelectBin={(bin) => setSelected({ kind: "bin", id: bin.id, data: bin })}
            onSelectToilet={(toilet) => setSelected({ kind: "toilet", id: toilet.id, data: toilet })}
            className="h-72 sm:h-80"
          />

          {selected ? (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{selected.data.name}</p>
                <p className="truncate text-xs text-slate-500">{selected.data.address}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={googleMapsSearchUrl(selected.data.latitude, selected.data.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                >
                  Open in Maps
                </a>
                <button
                  type="button"
                  onClick={() => navigate(selected.kind === "bin" ? "/official/bins" : "/official/toilets")}
                  className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {selected.kind === "bin" ? "View Bins" : "View Toilets"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Tap a pin to see its details.</p>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-900">Bin Fill Level Overview</h2>
          <div className="flex flex-col gap-3">
            <FillBar
              color={BIN_STATUS_STYLE.normal.color}
              label="Normal (≤ 70%)"
              value={binStats.normal}
              total={binStats.total}
            />
            <FillBar
              color={BIN_STATUS_STYLE.almost_full.color}
              label="Almost Full (71–90%)"
              value={binStats.almostFull}
              total={binStats.total}
            />
            <FillBar
              color={BIN_STATUS_STYLE.overflow.color}
              label="Overflow (> 90%)"
              value={binStats.overflowing}
              total={binStats.total}
            />
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>{binStats.total} Total Bins</span>
            <button
              type="button"
              onClick={() => navigate("/official/bins")}
              className="font-semibold text-sky-700"
            >
              View All →
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold text-slate-900">Recent Complaints</h2>
          <StatusFilterTabs options={FILTERS} value={filter} onChange={setFilter} />
        </div>

        <GovComplaintsList complaints={recent} />
      </div>
    </GovShell>
  );
}
