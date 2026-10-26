import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

// Click-to-place map used by the Government "Add / Edit Facility" and the
// Worker "Request Facility" forms. OpenStreetMap tiles via Leaflet — no
// API key. Clicking (or tapping) the map reports the coordinates; the
// marker follows the `value` prop so typing coordinates by hand moves it
// too.

const pinIcon = L.divIcon({
  className: "ssb-pin",
  html: `<svg width="30" height="38" viewBox="0 0 32 40" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 24 16 24s16-13 16-24C32 7.2 24.8 0 16 0z" fill="#0284c7" stroke="#fff" stroke-width="1.5"/><circle cx="16" cy="15.5" r="6" fill="#fff"/></svg>`,
  iconSize: [30, 38],
  iconAnchor: [15, 38],
});

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ latitude: Number(e.latlng.lat.toFixed(6)), longitude: Number(e.latlng.lng.toFixed(6)) });
    },
  });
  return null;
}

function Recenter({ value }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.latitude, value.longitude], Math.max(map.getZoom(), 17));
  }, [value?.latitude, value?.longitude, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Props:
 * - value: { latitude, longitude } | null — the chosen point
 * - onPick({ latitude, longitude }) — called when the user taps the map
 * - center: where to open when there is no value yet
 */
export default function PickLocationMap({ value, onPick, center, zoom = 17, className = "" }) {
  const start = value ?? center;
  return (
    <div className={`isolate overflow-hidden rounded-2xl border border-slate-200 ${className}`}>
      <MapContainer
        center={[start.latitude, start.longitude]}
        zoom={zoom}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onPick} />
        <Recenter value={value} />
        {value && <Marker position={[value.latitude, value.longitude]} icon={pinIcon} />}
      </MapContainer>
    </div>
  );
}
