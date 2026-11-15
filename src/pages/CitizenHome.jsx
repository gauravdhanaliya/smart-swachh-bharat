import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import CitizenShell from "../components/CitizenShell";
import MapPreview from "../components/MapPreview";
import CitySelector from "../components/CitySelector";
import AddLocationDialog from "../components/AddLocationDialog";
import BrandLogo from "../components/BrandLogo";
import Icon from "../components/Icon";
import { useAuth } from "../context/AuthContext";
import { useLiveBins } from "../hooks/useLiveBins";
import { useLiveToilets } from "../hooks/useLiveToilets";
import { useComplaints, useComplaintsStatus } from "../hooks/useComplaints";
import { useCity } from "../hooks/useCity";
import { useCitizenNotifications } from "../hooks/useCitizenNotifications";
import { useMyLocation } from "../hooks/useMyLocation";
import { useRatingSummaries } from "../hooks/useRatingSummaries";
import { useSyncStatus } from "../hooks/useSyncStatus";
import { inCity } from "../data/cities";
import { STATUS } from "../data/complaints";
import { DEMO_USERS } from "../services/authSession";
import { distanceMeters } from "../utils/addressLookup";
import { displayFacilityName } from "../utils/facilityName";
import { formatAverage } from "../utils/ratings";
import { EASE_OUT } from "../utils/motion";

// How many toilets the Home lists (the full list is on the map).
const TOILETS_SHOWN = 2;
const OPEN_FIRST = { Open: 0, Maintenance: 1, Closed: 2 };
// The one card style: white, 1px border, 16px radius.
const CARD = "rounded-2xl border border-line bg-white";
const DEFAULT_NAMES = new Set(["citizen", ...Object.values(DEMO_USERS).map((u) => u.name)]);
// Status dot colours (status only), always with the status in words beside it.
const STATUS_DOT = { Open: "bg-green-600", Maintenance: "bg-amber-500", Closed: "bg-red-600" };

const formatDistance = (m) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

/**
 * The citizen Home, "clean white": a header (logo, name, bell), the greeting
 * and city, three quick actions (Report, My reports, Map), the map preview
 * with real pins (or a counts card), and the city's public toilets. One small
 * DEMO banner when the facilities shown are demo data. Fits one phone screen:
 * the map takes whatever height is left. Skeletons while data loads.
 */
export default function CitizenHome() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user, usesApi } = useAuth();
  const allBins = useLiveBins();
  const allToilets = useLiveToilets();
  const complaints = useComplaints();
  const complaintsStatus = useComplaintsStatus();
  const sync = useSyncStatus();
  const { city, cities, selectCity, addLocation, removeLocation } = useCity();
  const [addingLocation, setAddingLocation] = useState(false);
  const [locationPrefill, setLocationPrefill] = useState(null);
  const { unreadCount } = useCitizenNotifications();
  const here = useMyLocation();

  const name = user?.name && !DEFAULT_NAMES.has(user.name) ? user.name : "";
  const bins = useMemo(() => allBins.filter((b) => inCity(b, city)), [allBins, city]);
  const toilets = useMemo(() => allToilets.filter((t) => inCity(t, city)), [allToilets, city]);
  const showingDemo = useMemo(() => [...bins, ...toilets].some((f) => displayFacilityName(f).demo), [bins, toilets]);

  // Without a location: open ones first, by name. With one: nearest first, with distances.
  const shownToilets = useMemo(() => {
    const from = here.position;
    const list = toilets.map((t) => ({
      ...t,
      metres: from && Number.isFinite(t.latitude) && Number.isFinite(t.longitude) ? distanceMeters(from.latitude, from.longitude, t.latitude, t.longitude) : null,
    }));
    list.sort((a, b) =>
      from
        ? (a.metres ?? Infinity) - (b.metres ?? Infinity)
        : (OPEN_FIRST[a.status] ?? 3) - (OPEN_FIRST[b.status] ?? 3) || displayFacilityName(a).name.localeCompare(displayFacilityName(b).name)
    );
    return list.slice(0, TOILETS_SHOWN);
  }, [toilets, here.position]);
  const ratings = useRatingSummaries(useMemo(() => shownToilets.map((t) => t.id), [shownToilets]));

  // Only this citizen's own reports. The API already sends a citizen only
  // their own; the browser-only build keeps everyone's in one list.
  const mine = useMemo(() => {
    const own = usesApi ? complaints : complaints.filter((c) => c.citizenId === user?.id);
    const resolved = own.filter((c) => c.status === STATUS.RESOLVED).length;
    return { total: own.length, open: own.length - resolved, resolved };
  }, [complaints, usesApi, user?.id]);

  const located = here.status === "ready";
  const placesLoaded = sync.loaded || allToilets.length > 0 || allBins.length > 0;
  const reportsLoaded = complaintsStatus.loaded !== false;
  const mapCenter = useMemo(() => ({ latitude: city.latitude, longitude: city.longitude }), [city.latitude, city.longitude]);
  // Subtle entrance only: the content fades up once (not at all with reduced motion).
  const enter = reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } } };

  const actions = [
    { id: "report", label: "Report", note: "New issue", icon: "plus", to: "/citizen/report", aria: "Report an issue" },
    {
      id: "mine",
      label: "My reports",
      note: !reportsLoaded ? "Loading…" : mine.total ? `${mine.open} open` : "None yet",
      icon: "reports",
      to: "/citizen/complaints",
      aria: !reportsLoaded ? "My reports: loading" : mine.total ? `My reports: ${mine.open} open, ${mine.resolved} resolved` : "My reports: no reports yet",
    },
    { id: "map", label: "Map", note: "Bins, toilets", icon: "map", to: "/citizen/map", aria: "Map of bins and toilets" },
  ];

  return (
    <CitizenShell>
      {/* One screen on a phone: the map is the only part that flexes, so it
          takes what is left and there is never a gap. When the "Verify your
          email" banner takes room, the page scrolls in its own area (never
          under the tab bar). 8px spacing grid. npm run test:layout checks both. */}
      <div className="flex flex-1 flex-col bg-white px-4 pt-2">
        {/* Header: logo and name, bell */}
        <div className="flex shrink-0 items-center justify-between">
          <BrandLogo size="sm" nameAs="p" />
          <button
            type="button"
            onClick={() => navigate("/citizen/notifications")}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            className="relative -mr-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-ink hover:bg-section focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <Icon name="bell" className="h-6 w-6" />
            {unreadCount > 0 && (
              <span data-unread-badge className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-600 ring-2 ring-white" aria-hidden="true" />
            )}
          </button>
        </div>

        {showingDemo && (
          <p data-demo-banner className="mt-2 flex shrink-0 items-center gap-2 rounded-xl bg-section px-3 py-2 text-xs text-muted">
            <Icon name="info" className="h-4 w-4" />
            <span>
              <span className="font-semibold text-ink">DEMO</span> The bins and toilets shown are sample data.
            </span>
          </p>
        )}

        {/* Greeting and city */}
        <div className="mt-4 flex shrink-0 items-center justify-between gap-2">
          <h1 className="min-w-0 truncate text-2xl leading-tight font-semibold text-ink">{name ? `Hello, ${name}` : "Hello"}</h1>
          <CitySelector
            city={city}
            cities={cities}
            onSelect={selectCity}
            onAddLocation={(prefill) => {
              setLocationPrefill(prefill ?? null);
              setAddingLocation(true);
            }}
            onRemoveLocation={removeLocation}
          />
        </div>

        <motion.div {...enter} data-home-content className="mt-4 flex flex-1 flex-col">
          {/* Quick actions */}
          <div className="grid shrink-0 grid-cols-3 gap-2">
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(a.to)}
                aria-label={a.aria}
                data-quick-action={a.id}
                className={`flex min-h-24 cursor-pointer flex-col items-start justify-between ${CARD} p-3 text-left transition-colors hover:bg-section focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.id === "report" ? "bg-brand text-white" : "bg-section text-brand"}`} aria-hidden="true">
                  <Icon name={a.icon} className="h-5 w-5" />
                </span>
                <span className="mt-2 block w-full">
                  <span className="block text-sm leading-tight font-semibold text-ink">{a.label}</span>
                  <span className="block truncate text-xs text-muted" data-my-reports={a.id === "mine" ? "" : undefined}>
                    {a.note}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* The map: the one part allowed to flex. */}
          <section aria-labelledby="home-map-title" className="mt-6 flex flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h2 id="home-map-title" className="text-lg leading-tight font-semibold text-ink">
                Bins and toilets in {city.name}
              </h2>
              <button
                type="button"
                onClick={() => navigate("/citizen/map")}
                className="relative z-10 -my-2.5 -mr-1 flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-brand hover:text-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                See full map
              </button>
            </div>
            <div className="mt-2 min-h-32 flex-1">
              {placesLoaded ? (
                <MapPreview bins={bins} toilets={toilets} center={mapCenter} fill />
              ) : (
                <Skeleton className="h-full w-full rounded-2xl" label="Loading the map" />
              )}
            </div>
          </section>

          {/* Public toilets; nearest first once the citizen shares their location */}
          <section aria-labelledby="home-toilets-title" className="mt-6 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 id="home-toilets-title" className="text-lg leading-tight font-semibold text-ink">
                {located ? "Public toilets near you" : "Public toilets"}
              </h2>
              {!located && toilets.length > 0 && (
                <button
                  type="button"
                  onClick={here.locate}
                  disabled={here.status === "locating"}
                  className="-my-2.5 -mr-1 flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-1 text-sm font-semibold text-brand hover:text-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:cursor-wait"
                >
                  <Icon name="locate" className="h-4 w-4" />
                  {here.status === "locating" ? "Finding you…" : "Use my location"}
                </button>
              )}
            </div>
            <div aria-live="polite">
              {here.status === "error" && (
                <p role="alert" className="mt-1 text-sm text-red-700">
                  {here.message}
                </p>
              )}
            </div>
            {!placesLoaded ? (
              <div className={`mt-2 ${CARD}`} aria-busy="true" aria-label="Loading toilets">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-3">
                    <div className="flex-1">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="mt-2 h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : shownToilets.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No public toilets are mapped in {city.name} yet. The demo data covers Roorkee.</p>
            ) : (
              <ul className={`mt-2 divide-y divide-line ${CARD}`}>
                {shownToilets.map((t) => {
                  const { name: label } = displayFacilityName(t);
                  const rating = ratings.get(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/citizen/toilet/${encodeURIComponent(t.id)}`)}
                        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-section focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none focus-visible:ring-inset"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold text-ink">{label}</span>
                          <span className="block truncate text-sm text-muted">
                            {t.metres != null ? (
                              <span className="tabular-nums" data-distance>
                                {formatDistance(t.metres)}
                              </span>
                            ) : (
                              t.address || t.locationLabel || ""
                            )}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1 text-sm">
                          <span data-rating className={rating?.count ? "flex items-center gap-1 font-semibold text-ink" : "text-muted"}>
                            {rating?.count ? (
                              <>
                                {formatAverage(rating.average)}
                                <Icon name="star" className="h-4 w-4 text-amber-500" />
                              </>
                            ) : (
                              "Not rated"
                            )}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-muted">
                            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[t.status] ?? "bg-gray-400"}`} aria-hidden="true" />
                            {t.status}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </motion.div>
      </div>

      {addingLocation && (
        <AddLocationDialog
          initialName={locationPrefill?.name ?? ""}
          initialState={locationPrefill?.state ?? ""}
          onCancel={() => setAddingLocation(false)}
          onSave={(data) => {
            addLocation(data);
            setAddingLocation(false);
          }}
        />
      )}
    </CitizenShell>
  );
}

function Skeleton({ className = "", label }) {
  return <div role={label ? "status" : undefined} aria-label={label} className={`animate-pulse rounded-md bg-section motion-reduce:animate-none ${className}`} />;
}
