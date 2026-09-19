import { useLocation, useNavigate, useParams } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import StatusBadge from "../components/StatusBadge";
import { useLiveToilets } from "../hooks/useLiveToilets";

export default function ToiletDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const toilets = useLiveToilets();

  // Toilets pulled live from OpenStreetMap aren't in the local seed
  // dataset, so MapScreen passes the full toilet along via router
  // state when the citizen taps "View Details". Fall back to that
  // when the id isn't one of the built-in demo toilets.
  const stateToilet = routerLocation.state?.toilet;
  const toilet = stateToilet && stateToilet.id === id ? stateToilet : toilets.find((t) => t.id === id);

  // Step 4 → Step 3 handoff: send the citizen into the existing
  // complaint form with "Public Toilet Issue" and this toilet's
  // location pre-filled, instead of a separate report flow.
  const handleReportIssue = () => {
    navigate("/citizen/report", {
      state: {
        issueType: "Public Toilet Issue",
        location: {
          address: toilet.address,
          latitude: toilet.latitude,
          longitude: toilet.longitude,
          facilityId: toilet.id,
          facilityType: "Public Toilet",
        },
      },
    });
  };

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
            {toilet.cleanliness != null ? (
              <span className="flex items-center gap-1 text-sm text-emerald-800/70">
                <StarRating value={toilet.cleanliness} />
                <span className="ml-1">{toilet.cleanliness}/5 Cleanliness</span>
              </span>
            ) : (
              <span className="text-sm text-emerald-800/50">Not rated on OpenStreetMap</span>
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
            onClick={handleReportIssue}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01M10.3 4.3L2.7 18.7A1 1 0 003.6 20h16.8a1 1 0 00.9-1.3L13.7 4.3a1 1 0 00-1.7 0z" />
            </svg>
            Report Issue
          </button>
        </div>
      </div>
    </CitizenShell>
  );
}

function StarRating({ value }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 ${i < value ? "fill-orange-400" : "fill-emerald-100"}`}
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}
