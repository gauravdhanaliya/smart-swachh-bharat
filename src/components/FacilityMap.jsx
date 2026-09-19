import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

// FIX — bins/toilets stopped appearing as pins on the map when a
// previous pass swapped react-leaflet for a plain OpenStreetMap iframe
// embed (see SimpleMap.jsx). An iframe can only show ONE fixed marker,
// so every bin/toilet other than whatever was currently "selected" was
// invisible on the map itself (it only ever showed up in the list below
// it). This component restores a real interactive Leaflet map that
// plots every bin/toilet passed in as its own colored pin, and keeps
// the existing "tap a pin -> see details" flow the rest of the app
// already expects (onSelectBin/onSelectToilet).
//
// SimpleMap.jsx is intentionally left in place and still used for the
// screens that only ever need to preview/pick a single point (Government
// "Add Facility", Worker "Request Facility") — those don't need this.

// USABILITY AUDIT FIX (round 2, issue 3 — map cluttered with overlapping
// emoji markers): every bin and toilet was drawn as its own 32px
// emoji pin, so at city zoom (the Citizen Home preview) dozens of pins
// piled onto the same few pixels and none could be told apart or tapped.
// Three changes, all in this file:
//   1. Nearby facilities are grouped into count badges ("clusters") that
//      split apart as you zoom in — see FacilityPoints below. No extra
//      dependency; it's a small pixel-distance grouping.
//   2. The emoji glyphs are replaced with inline SVG icons drawn from the
//      same shapes the rest of the app uses, so they render identically on
//      every OS and stay crisp at small sizes.
//   3. A `compact` mode (used by the small Home preview) draws tiny status
//      dots instead of full pins: circle = bin, rounded square = toilet, so
//      type never depends on colour alone.

const BIN_COLORS = {
  normal: "#16a34a",
  almost_full: "#f59e0b",
  overflow: "#dc2626",
};

const TOILET_COLORS = {
  open: "#0284c7",
  closed: "#dc2626",
  maintenance: "#d97706",
};

// Cluster badge colour reflects the WORST status inside it, so an
// overflowing bin is never hidden behind a calm-looking group.
const CLUSTER_COLORS = ["#047857", "#f59e0b", "#dc2626"];

// Grouping distance in screen pixels: roughly the footprint of one
// marker, so two markers that would visibly overlap get merged.
const CLUSTER_RADIUS_PX = { pin: 34, compact: 20 };

// Zoom level (OSM tiles go to 19) at which we stop grouping and show
// every marker, so two facilities at the exact same spot can't end up
// stuck in a cluster you can never split.
const UNCLUSTER_ZOOM = 17;

function binSeverity(status) {
  if (status === "overflow") return 2;
  if (status === "almost_full") return 1;
  return 0;
}

function toiletSeverity(status) {
  const value = String(status).toLowerCase();
  if (value === "closed") return 2;
  if (value === "maintenance") return 1;
  return 0;
}

// Icons are stroked/filled with the pin's own colour, on a white disc.
function binGlyph(color, px) {
  return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M6 7h12l-1 13H7L6 7zM9 7V4h6v3M10 11v5M14 11v5"/></svg>`;
}

function toiletGlyph(color, px) {
  return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="${color}" aria-hidden="true" style="display:block"><circle cx="7" cy="5" r="2.2"/><rect x="4.4" y="8.6" width="5.2" height="7" rx="1.6"/><rect x="5" y="15.4" width="1.8" height="5.6" rx=".9"/><rect x="7.4" y="15.4" width="1.8" height="5.6" rx=".9"/><circle cx="17" cy="5" r="2.2"/><path d="M17 8.6l3.4 8.2h-6.8z"/><rect x="15.4" y="16" width="1.4" height="5" rx=".7"/><rect x="17.2" y="16" width="1.4" height="5" rx=".7"/></svg>`;
}

// `glyph` is either a ready-made HTML string (the generic `markers`
// prop still passes emoji through untouched) or a (color, px) => html
// function so the icon can scale with the pin.
function pinIcon({ color, glyph, selected }) {
  const size = selected ? 40 : 32;
  const glyphPx = Math.round(size * 0.42);
  const glyphHtml = typeof glyph === "function" ? glyph(color, glyphPx) : glyph;
  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 32 40" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
        <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 24 16 24s16-13 16-24C32 7.2 24.8 0 16 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="16" cy="15.5" r="11.5" fill="#fff" opacity="0.95"/>
      </svg>
      <span style="position:absolute;top:${(size * 15.5) / 40}px;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;font-size:${selected ? 16 : 13}px;line-height:1;">${glyphHtml}</span>
      ${
        selected
          ? `<span style="position:absolute;top:16px;left:50%;width:${size * 0.85}px;height:${size * 0.85}px;border-radius:9999px;border:2px solid ${color};animation:ssb-pin-pulse 1.6s ease-out infinite;"></span>`
          : ""
      }
    </div>
  `;
  return L.divIcon({
    html,
    className: "ssb-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

// Tiny status marker for small, non-interactive previews.
function dotIcon({ color, kind }) {
  const isBin = kind === "bin";
  const size = isBin ? 14 : 12;
  const radius = isBin ? "9999px" : "3px";
  const html = `<div style="width:${size}px;height:${size}px;border-radius:${radius};background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.45);box-sizing:content-box;"></div>`;
  const box = size + 4;
  return L.divIcon({
    html,
    className: "ssb-pin",
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  });
}

function clusterIcon({ count, severity, compact }) {
  const size = compact ? 26 : 38;
  const label = count > 99 ? "99+" : String(count);
  const html = `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${CLUSTER_COLORS[severity]};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${compact ? 11 : 14}px;line-height:1;font-family:var(--font-sans, system-ui, sans-serif);">${label}</div>`;
  return L.divIcon({
    html,
    className: "ssb-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function meIcon() {
  const html = `
    <div style="position:relative;width:22px;height:22px;">
      <span style="position:absolute;inset:0;border-radius:9999px;background:#0284c7;opacity:0.28;animation:ssb-me-pulse 1.8s ease-out infinite;"></span>
      <span style="position:absolute;top:50%;left:50%;width:14px;height:14px;transform:translate(-50%,-50%);border-radius:9999px;background:#0284c7;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></span>
    </div>
  `;
  return L.divIcon({ html, className: "ssb-pin", iconSize: [22, 22], iconAnchor: [11, 11] });
}

/**
 * <MapContainer center=/zoom=> only applies once, on first mount — this
 * keeps the live Leaflet view in sync whenever `center`/`zoom` change
 * later from React state (e.g. tapping a different bin, or "Use My
 * Location"). Flies smoothly on a genuinely new selection, snaps
 * instantly for everything else (e.g. a status-filter re-render).
 */
function MapViewController({ center, zoom, selectedKey }) {
  const map = useMap();
  const lastSelectedKey = useRef(selectedKey);

  useEffect(() => {
    if (typeof center?.latitude !== "number" || typeof center?.longitude !== "number") return;
    const isNewSelection = selectedKey !== lastSelectedKey.current;
    lastSelectedKey.current = selectedKey;

    if (isNewSelection) {
      map.flyTo([center.latitude, center.longitude], zoom, { duration: 0.6 });
    } else {
      map.setView([center.latitude, center.longitude], zoom);
    }
  }, [center?.latitude, center?.longitude, zoom, selectedKey, map]);

  return null;
}

/**
 * Renders every bin/toilet, grouping markers that would overlap on screen
 * into a single count badge. Grouping is done in projected pixel space at
 * the current zoom, so it recomputes only when the zoom changes (or the
 * data does) — panning never reshuffles clusters.
 */
function FacilityPoints({
  bins,
  toilets,
  compact,
  cluster,
  interactive,
  selectedKind,
  selectedId,
  onSelectBin,
  onSelectToilet,
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const points = useMemo(() => {
    const hasCoords = (item) => typeof item.latitude === "number" && typeof item.longitude === "number";
    return [
      ...bins.filter(hasCoords).map((item) => ({
        key: `bin-${item.id}`,
        kind: "bin",
        item,
        severity: binSeverity(item.status),
        color: BIN_COLORS[item.status] ?? BIN_COLORS.normal,
      })),
      ...toilets.filter(hasCoords).map((item) => ({
        key: `toilet-${item.id}`,
        kind: "toilet",
        item,
        severity: toiletSeverity(item.status),
        color: TOILET_COLORS[String(item.status).toLowerCase()] ?? TOILET_COLORS.open,
      })),
    ];
  }, [bins, toilets]);

  const { singles, clusters } = useMemo(() => {
    const selectedKey = selectedKind && selectedId ? `${selectedKind}-${selectedId}` : null;
    const shouldCluster = cluster && zoom < UNCLUSTER_ZOOM;
    if (!shouldCluster) return { singles: points, clusters: [] };

    // The selected facility is always drawn on its own, never absorbed
    // into a badge, so tapping a result always leaves something to see.
    const singles = [];
    const groups = [];
    const radius = compact ? CLUSTER_RADIUS_PX.compact : CLUSTER_RADIUS_PX.pin;

    for (const point of points) {
      if (point.key === selectedKey) {
        singles.push(point);
        continue;
      }
      const px = map.project([point.item.latitude, point.item.longitude], zoom);
      const home = groups.find((g) => (g.x - px.x) ** 2 + (g.y - px.y) ** 2 <= radius * radius);
      if (home) {
        home.points.push(point);
        // Running mean keeps the badge at the group's visual centre.
        home.x += (px.x - home.x) / home.points.length;
        home.y += (px.y - home.y) / home.points.length;
      } else {
        groups.push({ x: px.x, y: px.y, points: [point] });
      }
    }

    const clusters = [];
    for (const group of groups) {
      if (group.points.length === 1) singles.push(group.points[0]);
      else clusters.push(group);
    }
    return { singles, clusters };
  }, [points, zoom, cluster, compact, selectedKind, selectedId, map]);

  return (
    <>
      {singles.map((point) => {
        const { item, kind, color, severity } = point;
        const isSelected = selectedKind === kind && selectedId === item.id;
        const onSelect = kind === "bin" ? onSelectBin : onSelectToilet;
        const icon = compact
          ? dotIcon({ color, kind })
          : pinIcon({
              color,
              glyph: kind === "bin" ? binGlyph : toiletGlyph,
              selected: isSelected,
            });
        return (
          <Marker
            key={point.key}
            position={[item.latitude, item.longitude]}
            icon={icon}
            interactive={interactive}
            keyboard={interactive}
            // Worse-status markers paint on top of calmer neighbours.
            zIndexOffset={isSelected ? 1000 : severity * 100}
            eventHandlers={onSelect ? { click: () => onSelect(item) } : undefined}
          >
            {interactive && (
              <Tooltip direction="top" offset={[0, compact ? -8 : -30]}>
                {item.name}
              </Tooltip>
            )}
          </Marker>
        );
      })}

      {clusters.map((group, index) => {
        const count = group.points.length;
        const severity = Math.max(...group.points.map((p) => p.severity));
        const center = map.unproject([group.x, group.y], zoom);
        return (
          <Marker
            key={`cluster-${zoom}-${index}`}
            position={center}
            icon={clusterIcon({ count, severity, compact })}
            interactive={interactive}
            keyboard={interactive}
            zIndexOffset={500 + severity * 100}
            eventHandlers={
              interactive
                ? {
                    click: () => {
                      const bounds = L.latLngBounds(
                        group.points.map((p) => [p.item.latitude, p.item.longitude])
                      );
                      map.fitBounds(bounds, { padding: [48, 48], maxZoom: UNCLUSTER_ZOOM });
                    },
                  }
                : undefined
            }
          >
            {interactive && (
              <Tooltip direction="top" offset={[0, -14]}>
                {count} nearby locations — tap to zoom in
              </Tooltip>
            )}
          </Marker>
        );
      })}
    </>
  );
}

/**
 * Props:
 * - bins, toilets: arrays of { id, latitude, longitude, name, status }
 * - markers: generic pins for anything that isn't a bin/toilet (e.g.
 *   worker task locations) — array of
 *   { id, latitude, longitude, name, color, glyph }
 * - center: { latitude, longitude } — required, map center
 * - zoom: number (default 13)
 * - selectedKind: "bin" | "toilet" | "marker" | null, selectedId:
 *   string | null — used to draw the matching pin larger/pulsing
 * - userLocation: { latitude, longitude } optional "you are here" dot
 * - onSelectBin(bin), onSelectToilet(toilet), onSelectMarker(marker):
 *   tap handlers
 * - interactive: false for small non-interactive previews (also hides
 *   the map from assistive tech and keyboard focus — it's decoration
 *   inside a button there)
 * - compact: draw small status dots instead of full pins (previews)
 * - cluster: group overlapping bins/toilets into count badges
 *   (default true)
 */
export default function FacilityMap({
  bins = [],
  toilets = [],
  markers = [],
  center,
  zoom = 13,
  selectedKind = null,
  selectedId = null,
  userLocation,
  onSelectBin,
  onSelectToilet,
  onSelectMarker,
  interactive = true,
  compact = false,
  cluster = true,
  className = "",
}) {
  const selectedKey = selectedKind && selectedId ? `${selectedKind}-${selectedId}` : null;

  const genericMarkers = useMemo(
    () =>
      markers
        .filter((m) => typeof m.latitude === "number" && typeof m.longitude === "number")
        .map((marker) => {
          const isSelected = selectedKind === "marker" && selectedId === marker.id;
          return (
            <Marker
              key={`marker-${marker.id}`}
              position={[marker.latitude, marker.longitude]}
              icon={pinIcon({
                color: marker.color ?? "#0284c7",
                glyph: marker.glyph ?? "\u{1F4CD}",
                selected: isSelected,
              })}
              interactive={interactive}
              keyboard={interactive}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={onSelectMarker ? { click: () => onSelectMarker(marker) } : undefined}
            >
              {interactive && marker.name && (
                <Tooltip direction="top" offset={[0, -30]}>
                  {marker.name}
                </Tooltip>
              )}
            </Marker>
          );
        }),
    [markers, selectedKind, selectedId, onSelectMarker, interactive]
  );

  if (typeof center?.latitude !== "number" || typeof center?.longitude !== "number") {
    return (
      <div
        className={`flex w-full items-center justify-center overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50 text-xs font-medium text-emerald-800/60 ${className}`}
      >
        No location to show yet.
      </div>
    );
  }

  return (
    // `isolate` (round 2, issue 2): Leaflet's internal panes use z-index
    // 400-1000, and without their own stacking context those numbers
    // compete with the rest of the page — a map scrolled behind the Quick
    // Actions sheet (z-30) painted straight through it. Isolating the
    // wrapper keeps every Leaflet z-index inside the map.
    <div
      aria-hidden={interactive ? undefined : true}
      className={`isolate w-full overflow-hidden rounded-2xl border border-emerald-100 ${interactive ? "" : "pointer-events-none"} ${className}`}
    >
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={zoom}
        className="h-full w-full"
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={false}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        attributionControl={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewController center={center} zoom={zoom} selectedKey={selectedKey} />
        <FacilityPoints
          bins={bins}
          toilets={toilets}
          compact={compact}
          cluster={cluster}
          interactive={interactive}
          selectedKind={selectedKind}
          selectedId={selectedId}
          onSelectBin={onSelectBin}
          onSelectToilet={onSelectToilet}
        />
        {genericMarkers}
        {userLocation &&
          typeof userLocation.latitude === "number" &&
          typeof userLocation.longitude === "number" && (
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={meIcon()}
              interactive={interactive}
              keyboard={interactive}
              zIndexOffset={2000}
            />
          )}
      </MapContainer>
    </div>
  );
}
