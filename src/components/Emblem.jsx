/**
 * Government of India emblem badge — an original, simplified silhouette
 * of the lion-capital motif (three maned lions above the chakra abacus
 * and lotus base), not a reproduction of the official artwork.
 *
 * Drawn in `currentColor`, so the colour comes from a text-* class:
 *   <Emblem className="h-16 w-16 text-emerald-950" />
 *   <Emblem className="h-9 w-9 text-white" />   // dark backgrounds
 */
export default function Emblem({ className = "h-14 w-14", showMotto = true }) {
  return (
    <svg
      viewBox={showMotto ? "0 0 64 74" : "0 0 64 62"}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Government of India emblem"
    >
      <g fill="currentColor" fillRule="evenodd">
        {/* left lion */}
        <path d="M22.0 25.0 A2.6 2.6 0 0 1 20.7 29.1 A2.6 2.6 0 0 1 17.2 31.7 A2.6 2.6 0 0 1 12.8 31.7 A2.6 2.6 0 0 1 9.3 29.1 A2.6 2.6 0 0 1 8.0 25.0 A2.6 2.6 0 0 1 9.3 20.9 A2.6 2.6 0 0 1 12.8 18.3 A2.6 2.6 0 0 1 17.2 18.3 A2.6 2.6 0 0 1 20.7 20.9 A2.6 2.6 0 0 1 22.0 25.0 Z M12.4 23.6 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 Z M8.8 26.2 h3.2 v0.9 h-3.2 Z" />
        {/* right lion */}
        <path d="M56.0 25.0 A2.6 2.6 0 0 1 54.7 29.1 A2.6 2.6 0 0 1 51.2 31.7 A2.6 2.6 0 0 1 46.8 31.7 A2.6 2.6 0 0 1 43.3 29.1 A2.6 2.6 0 0 1 42.0 25.0 A2.6 2.6 0 0 1 43.3 20.9 A2.6 2.6 0 0 1 46.8 18.3 A2.6 2.6 0 0 1 51.2 18.3 A2.6 2.6 0 0 1 54.7 20.9 A2.6 2.6 0 0 1 56.0 25.0 Z M51.6 23.6 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 Z M52.0 26.2 h3.2 v0.9 h-3.2 Z" />
        {/* centre lion */}
        <path d="M42.2 20.0 A3.0 3.0 0 0 1 41.0 24.7 A3.0 3.0 0 0 1 37.8 28.4 A3.0 3.0 0 0 1 33.2 30.1 A3.0 3.0 0 0 1 28.4 29.5 A3.0 3.0 0 0 1 24.4 26.8 A3.0 3.0 0 0 1 22.1 22.4 A3.0 3.0 0 0 1 22.1 17.6 A3.0 3.0 0 0 1 24.4 13.2 A3.0 3.0 0 0 1 28.4 10.5 A3.0 3.0 0 0 1 33.2 9.9 A3.0 3.0 0 0 1 37.8 11.6 A3.0 3.0 0 0 1 41.0 15.3 A3.0 3.0 0 0 1 42.2 20.0 Z M29.0 18.0 m-1.25 0 a1.25 1.25 0 1 0 2.5 0 a1.25 1.25 0 1 0 -2.5 0 Z M35.0 18.0 m-1.25 0 a1.25 1.25 0 1 0 2.5 0 a1.25 1.25 0 1 0 -2.5 0 Z M30.4 21.8 h3.2 l-1.6 2.2 Z M29.8 25.2 h4.4 v1 h-4.4 Z" />
        {/* shoulders, abacus, lotus base */}
        <path d="M13 30h38c1.4 2.4 2.2 4.8 2.4 7H10.6c.2-2.2 1-4.6 2.4-7z" />
        {/* abacus with the chakra cut out */}
        <path d="M9.5 36.6h45a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-45A1.5 1.5 0 0 1 8 43.1v-5a1.5 1.5 0 0 1 1.5-1.5z M32 40.6 m-3.6 0 a3.6 3.6 0 1 0 7.2 0 a3.6 3.6 0 1 0 -7.2 0 Z M32 40.6 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 Z" />
        <path d="M20 45.6h24c1 4.4 3.4 7.8 7 10.2H13c3.6-2.4 6-5.8 7-10.2z" />
        <rect x="9" y="55.6" width="46" height="3.4" rx="1.7" />
      </g>

      {/* chakra spokes inside the cut-out */}
      <g stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" fill="none">
        <path d="M32 37.2v6.8M28.6 40.6h6.8M29.6 38.2l4.8 4.8M34.4 38.2l-4.8 4.8" />
      </g>

      {showMotto && (
        <text
          x="32"
          y="70"
          textAnchor="middle"
          fontSize="8.5"
          fontWeight="600"
          fill="currentColor"
          style={{ fontFamily: "'Nirmala UI','Noto Sans Devanagari','Mangal',sans-serif" }}
        >
          सत्यमेव जयते
        </text>
      )}
    </svg>
  );
}
