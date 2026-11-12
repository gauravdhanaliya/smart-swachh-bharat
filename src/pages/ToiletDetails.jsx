import { useLocation, useNavigate, useParams } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import StatusBadge from "../components/StatusBadge";
import { useLiveToilets } from "../hooks/useLiveToilets";
import { useLocationDetail } from "../hooks/useLocationDetail";
import { locationToToilet } from "../services/locationAdapters";
import { useAuth } from "../context/AuthContext";
import ToiletRatingPanel from "../components/ToiletRatingPanel";
import { OpenReportsNote, ReportFacilitySheet, useReportSheet } from "../components/FacilityReportControls";

export default function ToiletDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const toilets = useLiveToilets();
  const { role } = useAuth();
  const report = useReportSheet();

  // Toilets pulled live from OpenStreetMap aren't in the local seed
  // dataset, so MapScreen passes the full toilet along via router
  // state when the citizen taps "View Details". Fall back to that
  // when the id isn't one of the built-in demo toilets.
  const stateToilet = routerLocation.state?.toilet;
  const live = stateToilet && stateToilet.id === id ? stateToilet : toilets.find((t) => t.id === id);
  const { record: toilet, loading } = useLocationDetail(id, live, locationToToilet);


  if (!toilet && loading) {
    return (
      <CitizenShell>
        <p role="status" className="px-5 py-10 text-center text-sm text-slate-500">
          Loading…
        </p>
      </CitizenShell>
    );
  }

  if (!toilet) {
    return (
      <CitizenShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-lg font-semibold text-emerald-950">Toilet not found</p>
          <p className="text-sm text-emerald-800/60">
            This isn't in the demo data set, and live OpenStreetMap pins aren't kept after a page
            refresh — try opening it again from the map.
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
        <h1 className="text-lg font-bold text-emerald-950">Toilet Details</h1>
      </div>

      <div className="px-5 pb-6">
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-100 text-2xl">
              🚻
            </span>
            <div>
              <h2 className="text-lg font-bold text-emerald-950">{toilet.name}</h2>
              <p className="text-sm text-emerald-800/60">{toilet.id}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <StatusBadge status={toilet.status} />
            {toilet.source === "osm" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                🌐 Live · OpenStreetMap
              </span>
            )}
          </div>

          <div className="mt-4 flex items-start gap-2.5 border-t border-emerald-50 pt-4 text-sm">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <div>
              <p className="text-emerald-950">{toilet.address}</p>
              {toilet.distance && <p className="text-emerald-800/50">{toilet.distance} away</p>}
              {toilet.openingHours && (
                <p className="text-emerald-800/50">Hours: {toilet.openingHours}</p>
              )}
              {toilet.locationLabel && (
                <p className="text-xs text-emerald-800/40">
                  {toilet.locationLabel}
                  {toilet.source !== "osm" && " · prototype data"}
                </p>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2.5 text-sm text-emerald-800/60">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            Last Updated: {toilet.lastUpdated}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-950">Facilities</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {toilet.facilities.map((facility) => (
              <span
                key={facility}
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
              >
                {facility}
              </span>
            ))}
          </div>
        </div>

        <OpenReportsNote facilityId={toilet.id} />

        {/* Ratings from citizens; only citizens get the form. */}
        <ToiletRatingPanel toiletId={toilet.id} canRate={role === "citizen"} />

        <div className="mt-4 flex gap-3">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${toilet.latitude},${toilet.longitude}`}
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
          facility={{ id: toilet.id, type: "toilet", name: toilet.name, address: toilet.address, latitude: toilet.latitude, longitude: toilet.longitude }}
        />
      </div>
    </CitizenShell>
  );
}

