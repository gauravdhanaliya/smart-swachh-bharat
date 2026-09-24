import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import StatTile from "../components/StatTile";
import MapPreview from "../components/MapPreview";
import CitySelector from "../components/CitySelector";
import AddLocationDialog from "../components/AddLocationDialog";
import { CARD_BUTTON, CARD_BUTTON_FILLED, TAP_LINK } from "../components/buttonStyles";
import { useLiveBins } from "../hooks/useLiveBins";
import { useLiveToilets } from "../hooks/useLiveToilets";
import { useComplaints } from "../hooks/useComplaints";
import { useCity } from "../hooks/useCity";
import { useCitizenNotifications } from "../hooks/useCitizenNotifications";
import { inCity } from "../data/cities";
import { BIN_STATUS } from "../data/bins";
import { STATUS } from "../data/complaints";

export default function CitizenHome() {
  const navigate = useNavigate();
  const allBins = useLiveBins();
  const allToilets = useLiveToilets();
  const complaints = useComplaints();
  const { city, cities, selectCity, addLocation, removeLocation } = useCity();
  const [addingLocation, setAddingLocation] = useState(false);
  const [locationPrefill, setLocationPrefill] = useState(null);
  const { unreadCount } = useCitizenNotifications();

  // Everything on this screen follows the chosen city. Demo data only
  // exists for Lucknow, so other cities honestly show zero.
  const bins = useMemo(() => allBins.filter((b) => inCity(b, city)), [allBins, city]);
  const toilets = useMemo(() => allToilets.filter((t) => inCity(t, city)), [allToilets, city]);

  const stats = useMemo(() => {
    const needsCollection = bins.filter((b) => b.status === BIN_STATUS.ALMOST_FULL).length;
    const overflowing = bins.filter((b) => b.status === BIN_STATUS.OVERFLOW).length;
    return { total: bins.length, needsCollection, overflowing };
  }, [bins]);

  const complaintStats = useMemo(
    () => ({
      resolved: complaints.filter((c) => c.status === STATUS.RESOLVED).length,
      total: complaints.length,
    }),
    [complaints]
  );

  return (
    <CitizenShell>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-5">
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

        <button
          type="button"
          onClick={() => navigate("/citizen/notifications")}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="relative flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 01-3.4 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      <div className="px-5 pb-4">
        {/* Greeting */}
        <div className="mt-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-emerald-950">
              Good Morning,
              <br />
              Citizen!
            </h1>
            <p className="mt-1 text-sm text-emerald-800/70">
              Let&apos;s keep our city clean and green.
            </p>
          </div>
          <span className="text-3xl">🌱</span>
        </div>

        {/* Total bins nearby */}
        <button
          type="button"
          onClick={() => navigate("/citizen/map")}
          className={`mt-4 ${CARD_BUTTON}`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg">
            🗑️
          </span>
          <span className="flex-1">
            <span className="block text-xs font-medium text-emerald-800/60">Total Bins Nearby</span>
            <span className="block text-2xl font-bold text-emerald-950">{stats.total}</span>
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700">
            View on map
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </button>

        {/* Stat grid */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatTile
            color="orange"
            value={stats.needsCollection}
            label="Bins Need Collection"
            icon={<BinGlyph />}
            onClick={() => navigate("/citizen/map?filter=bins")}
          />
          <StatTile
            color="red"
            value={stats.overflowing}
            label="Overflowing Bins"
            icon={<BinGlyph />}
            onClick={() => navigate("/citizen/map?filter=bins")}
          />
          <StatTile
            color="sky"
            value={complaintStats.resolved}
            label="Complaints Resolved"
            icon={<CheckGlyph />}
            onClick={() => navigate("/citizen/complaints")}
          />
          <StatTile
            color="slate"
            value={complaintStats.total}
            label="Total Complaints"
            icon={<FileGlyph />}
            onClick={() => navigate("/citizen/complaints")}
          />
        </div>

        {/* Small actions banner */}
        <button
          type="button"
          onClick={() => navigate("/citizen/eco-guide")}
          className={`mt-3 ${CARD_BUTTON_FILLED}`}
        >
          <span className="text-xl">🌿</span>
          <span className="flex-1 text-sm font-semibold">
            Small Actions
            <br />
            Make a Big Difference
            <span className="mt-0.5 block text-xs font-normal text-white/80">
              Open the Eco Guide — learn easy ways to help
            </span>
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>

        {/* Map preview */}
        <div className="mt-5">
          {/* USABILITY AUDIT FIX (round 2, issue 5): "See full map" was a
              12px bare-text link (~16px tall) jammed against the section
              title. It now uses TAP_LINK (14px, 44px-tall target) with an
              arrow so it reads as an action, and the header gets a gap so
              the two never crowd each other. -mr-3 cancels the token's
              px-3 so the link's text still aligns with the card edge. */}
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-emerald-950">Nearby Bins &amp; Toilets</h2>
            <button
              type="button"
              onClick={() => navigate("/citizen/map")}
              className={`-mr-3 gap-1 ${TAP_LINK}`}
            >
              See full map
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <MapPreview
            bins={bins}
            toilets={toilets}
            center={{ latitude: city.latitude, longitude: city.longitude }}
          />
          {bins.length === 0 && toilets.length === 0 && (
            <p className="mt-2 text-xs text-emerald-800/60">
              No bins or toilets are mapped in {city.name} yet — the demo data covers Lucknow.
            </p>
          )}
        </div>

        <p className="mt-6 pb-2 text-center text-xs text-emerald-800/40">
          Clean Cities · Healthy Citizens · Sustainable Future
        </p>
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

function BinGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 7h12l-1 13H7L6 7zM9 7V4h6v3M10 11v5M14 11v5" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v14H7V3z" />
      <path d="M10 12h4M10 16h4" />
    </svg>
  );
}
