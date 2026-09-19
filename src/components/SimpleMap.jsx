import { useMemo } from "react";

// Step 11B — Leaflet/react-leaflet replaced with a plain OpenStreetMap
// iframe embed. No API key, no billing, no Google Maps, no Leaflet.
//
// OSM's own embeddable view (openstreetmap.org/export/embed.html) only
// takes a bounding box (+ an optional marker), not a center+zoom pair
// like Leaflet did. `zoom` here is kept as the public prop so callers
// don't have to change, and is converted into a bounding box under the
// hood: each step down in zoom roughly doubles the ground distance
// shown, the same way Slippy Map tile zoom levels work. This is a
// visual approximation for a prototype preview, not a precise match to
// OSM's tile grid.
const REFERENCE_ZOOM = 15;
const REFERENCE_SPAN_DEG = 0.01; // ~1.1km of latitude at REFERENCE_ZOOM

function boundingBoxFor(latitude, longitude, zoom) {
  const latSpan = REFERENCE_SPAN_DEG * Math.pow(2, REFERENCE_ZOOM - zoom);
  // Longitude degrees get physically narrower the further from the
  // equator you are, so widen the box to compensate and keep the area
  // shown roughly square instead of stretched.
  const lonSpan = latSpan / Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);

  return {
    minLon: longitude - lonSpan,
    minLat: latitude - latSpan,
    maxLon: longitude + lonSpan,
    maxLat: latitude + latSpan,
  };
}

/**
 * Reusable, dependency-free OpenStreetMap embed.
 *
 * Props:
 * - latitude, longitude: center point to show (required)
 * - zoom: roughly how far in to show, higher = closer (default 15)
 * - markerLabel: used for the iframe's accessible title only
 * - interactive: set false for small non-interactive previews
 */
export default function SimpleMap({
  latitude,
  longitude,
  zoom = REFERENCE_ZOOM,
  markerLabel,
  interactive = true,
  className = "",
}) {
  const src = useMemo(() => {
    if (typeof latitude !== "number" || typeof longitude !== "number") return null;
    const { minLon, minLat, maxLon, maxLat } = boundingBoxFor(latitude, longitude, zoom);
    const params = new URLSearchParams({
      bbox: `${minLon.toFixed(6)},${minLat.toFixed(6)},${maxLon.toFixed(6)},${maxLat.toFixed(6)}`,
      layer: "mapnik",
      marker: `${latitude},${longitude}`,
    });
    return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
  }, [latitude, longitude, zoom]);

  if (!src) {
    return (
      <div
        className={`flex w-full items-center justify-center overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50 text-xs font-medium text-emerald-800/60 ${className}`}
      >
        No location to show yet.
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-emerald-100 ${className}`}>
      <iframe
        title={markerLabel ? `Map showing ${markerLabel}` : "Map"}
        src={src}
        className={`h-full w-full border-0 ${interactive ? "" : "pointer-events-none"}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

/** "Open in Google Maps" link with no API/key — just a plain search URL. */
export function googleMapsSearchUrl(latitude, longitude) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
