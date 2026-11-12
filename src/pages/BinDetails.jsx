import { useLocation, useNavigate, useParams } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import StatusBadge from "../components/StatusBadge";
import { useLiveBins } from "../hooks/useLiveBins";
import { BIN_STATUS_HINTS } from "../data/bins";
import { useLocationDetail } from "../hooks/useLocationDetail";
import { locationToBin } from "../services/locationAdapters";
import { OpenReportsNote, ReportFacilitySheet, useReportSheet } from "../components/FacilityReportControls";

export default function BinDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const report = useReportSheet();
  const bins = useLiveBins();

  // Map markers pulled live from OpenStreetMap aren't in the local
  // seed dataset, so MapScreen passes the full bin along via router
  // state when the citizen taps "View Details". Fall back to that
  // when the id isn't one of the built-in demo bins.
  const stateBin = routerLocation.state?.bin;
  const live = stateBin && stateBin.id === id ? stateBin : bins.find((b) => b.id === id);
  const { record: bin, loading } = useLocationDetail(id, live, locationToBin);


  if (!bin && loading) {
    return (
      <CitizenShell>
        <p role="status" className="px-5 py-10 text-center text-sm text-slate-500">
          Loading…
        </p>
      </CitizenShell>
    );
  }

  if (!bin) {
    return (
      <CitizenShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-lg font-semibold text-emerald-950">Bin not found</p>
          <p className="text-sm text-emerald-800/60">
            This bin isn't in the demo data set, and live OpenStreetMap pins aren't kept after a
            page refresh — try opening it again from the map.
          </p>
          <button
            type="button"
            onClick={() => navigate("/citizen/map")}
            className="mt-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Back to Map
          </button>
        </div>
      </CitizenShell>
    );
  }

  return (
    <CitizenShell>
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-emerald-950">Bin Details</h1>
      </div>

      <div className="px-5 pb-6">
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              🗑️
            </span>
            <div>
              <h2 className="text-lg font-bold text-emerald-950">{bin.type} Bin</h2>
              <p className="text-sm text-emerald-800/60">Bin ID: {bin.id}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-emerald-800/80">{BIN_STATUS_HINTS[bin.status] ?? BIN_STATUS_HINTS.normal}</p>
            <StatusBadge status={bin.status} className="shrink-0" />
          </div>

          <div className="mt-4 flex items-start gap-2.5 border-t border-emerald-50 pt-4 text-sm">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <div>
              <p className="text-emerald-950">{bin.address}</p>
              {bin.locationLabel && (
                <p className="text-xs text-emerald-800/40">
                  {bin.locationLabel}
                  {bin.source !== "osm" && " · prototype data"}
                </p>
              )}
            </div>
          </div>

          <p className="mt-2 text-[11px] text-emerald-800/40">
            Status is simulated <span className="font-medium">Prototype Live Status</span>,
            not a real municipal sensor reading.
          </p>

          <div className="mt-2 flex items-center gap-2.5 text-sm text-emerald-800/60">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            Last Updated: {bin.lastUpdated}
          </div>
        </div>

        <OpenReportsNote facilityId={bin.id} />

        <div className="mt-4 flex gap-3">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${bin.latitude},${bin.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-900/20"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l19-9-9 19-2-8-8-2z" />
            </svg>
            Navigate
          </a>
          <button
            type="button"
            onClick={report.show}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01M10.3 4.3L2.7 18.7A1 1 0 003.6 20h16.8a1 1 0 00.9-1.3L13.7 4.3a1 1 0 00-1.7 0z" />
            </svg>
            Report an issue
          </button>
        </div>
        <ReportFacilitySheet
          open={report.open}
          onClose={report.close}
          facility={{ id: bin.id, type: "bin", name: bin.name, address: bin.address, latitude: bin.latitude, longitude: bin.longitude }}
        />
      </div>
    </CitizenShell>
  );
}
