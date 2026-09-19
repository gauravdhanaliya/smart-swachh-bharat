import StatusBadge from "./StatusBadge";
import { googleMapsSearchUrl } from "./SimpleMap";
import { GHOST_RING } from "./buttonStyles";

// Step 11B section 4 — since a plain iframe can't carry our app's
// dynamic marker popups, this card shows the same details a marker
// popup used to, for whichever bin/toilet/location is currently
// selected on the map above.
export default function LocationCard({ kind, item, onViewDetails, onRetryLocation, onSetManually }) {
  if (kind === "me") {
    const approximate = Boolean(item.approximate);
    const manual = Boolean(item.manual);
    const tone = manual
      ? "border-emerald-100 bg-emerald-50"
      : approximate
        ? "border-amber-200 bg-amber-50"
        : "border-sky-100 bg-sky-50";

    return (
      <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              📍 {manual ? "Location set manually" : approximate ? "Approximate location" : "Your current location"}
            </p>
            {manual && item.label && (
              <p className="mt-1 text-xs font-medium text-emerald-900/80">{item.label}</p>
            )}
            <p className="mt-1 text-xs text-slate-700/70">
              Lat: {item.latitude.toFixed(5)} · Lng: {item.longitude.toFixed(5)}
            </p>
            {!manual && item.accuracy && (
              <p className="text-xs text-slate-700/50">± {Math.round(item.accuracy)} m accuracy</p>
            )}
          </div>
        </div>

        {approximate && !manual && (
          <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-snug text-amber-900">
            This came from your network (Wi-Fi/ISP), not GPS, so it can be off by kilometres — or land in
            another city on a laptop or VPN. Open the app on a phone over HTTPS with GPS on, or set your
            area manually.
          </p>
        )}

        <a
          href={googleMapsSearchUrl(item.latitude, item.longitude)}
          target="_blank"
          rel="noreferrer"
          className={`mt-3 block w-full text-center ${GHOST_RING}`}
        >
          Open {manual ? "This Area" : "My Location"} in Google Maps
        </a>

        {(onRetryLocation || onSetManually) && (
          <div className="mt-2 flex gap-2">
            {onRetryLocation && (
              <button
                type="button"
                onClick={onRetryLocation}
                className={`flex-1 ${GHOST_RING}`}
              >
                Retry GPS
              </button>
            )}
            {onSetManually && (
              <button
                type="button"
                onClick={onSetManually}
                className={`flex-1 ${GHOST_RING}`}
              >
                {manual ? "Change area" : "Not my location?"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const isBin = kind === "bin";

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-950">
            <span>{isBin ? "🗑️" : "🚻"}</span>
            <span className="truncate">{item.name}</span>
          </p>
          <p className="text-xs text-emerald-800/60">
            {item.id} · {item.area}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="mt-2 space-y-1 text-xs text-emerald-800/70">
        <div className="flex items-center justify-between">
          <span>Latitude</span>
          <span className="font-semibold">{item.latitude.toFixed(5)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Longitude</span>
          <span className="font-semibold">{item.longitude.toFixed(5)}</span>
        </div>
        {isBin && (
          <div className="flex items-center justify-between">
            <span>Fill Level</span>
            <span className="font-semibold">{item.fillLevel}%</span>
          </div>
        )}
        {!isBin && (
          <div className="flex items-center justify-between">
            <span>Opening Hours</span>
            <span className="font-semibold">{item.openingHours}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <a
          href={googleMapsSearchUrl(item.latitude, item.longitude)}
          target="_blank"
          rel="noreferrer"
          className={`flex-1 text-center ${GHOST_RING}`}
        >
          Open in Google Maps
        </a>
        <button
          type="button"
          onClick={() => onViewDetails(item.id)}
          className="flex-1 rounded-full bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
        >
          View Details
        </button>
      </div>
    </div>
  );
}
