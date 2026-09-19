/**
 * Decorative "clean city" scene used on the splash screen (full detail:
 * skyline, turbines, segregated bins, collection truck) and as a light
 * background flourish on the inner auth screens (`variant="subtle"`).
 */
export default function CityIllustration({ variant = "full", className = "" }) {
  const subtle = variant === "subtle";

  if (subtle) {
    return (
      <svg viewBox="0 0 400 200" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="#d7f0e0">
          <rect x="90" y="110" width="26" height="70" />
          <rect x="120" y="85" width="30" height="95" />
          <rect x="155" y="100" width="24" height="80" />
          <rect x="182" y="70" width="32" height="110" />
          <rect x="218" y="95" width="26" height="85" />
          <rect x="248" y="80" width="30" height="100" />
          <rect x="282" y="105" width="24" height="75" />
        </g>
        <g fill="#bfe6cc">
          <circle cx="20" cy="150" r="18" />
          <circle cx="45" cy="160" r="14" />
          <circle cx="355" cy="150" r="18" />
          <circle cx="378" cy="162" r="13" />
        </g>
        <g stroke="#bfe6cc" strokeWidth="2" fill="none">
          <path d="M60 180V110M60 110L45 95M60 110l15-12M60 110l2 20" />
          <path d="M330 180v-80M330 100l-15-15M330 100l15-12M330 100l2 20" />
        </g>
        <rect x="0" y="180" width="400" height="20" fill="#eaf7ef" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 400 230" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="ssbGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfe9cd" />
          <stop offset="100%" stopColor="#8fd6ab" />
        </linearGradient>
        <linearGradient id="ssbSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#d9f2e3" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="400" height="230" fill="url(#ssbSky)" />

      {/* clouds */}
      <g fill="#ffffff" opacity="0.75">
        <ellipse cx="58" cy="30" rx="26" ry="11" />
        <ellipse cx="80" cy="34" rx="18" ry="9" />
        <ellipse cx="330" cy="24" rx="28" ry="12" />
        <ellipse cx="306" cy="29" rx="18" ry="9" />
      </g>

      {/* birds */}
      <g stroke="#59b884" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M300 52c2-3 4-3 6 0M310 46c2-3 4-3 6 0M292 64c2-3 4-3 6 0" />
      </g>

      {/* back skyline */}
      <g fill="#a9dfc3" opacity="0.6">
        <rect x="96" y="66" width="30" height="120" rx="2" />
        <rect x="132" y="48" width="34" height="138" rx="2" />
        <rect x="172" y="78" width="26" height="108" rx="2" />
        <rect x="204" y="58" width="32" height="128" rx="2" />
        <rect x="242" y="86" width="28" height="100" rx="2" />
        <rect x="276" y="70" width="30" height="116" rx="2" />
      </g>

      {/* front skyline with windows */}
      <g fill="#7ccfa4" opacity="0.85">
        <rect x="112" y="96" width="26" height="90" rx="2" />
        <rect x="186" y="88" width="28" height="98" rx="2" />
        <rect x="256" y="104" width="26" height="82" rx="2" />
      </g>
      <g fill="#ffffff" opacity="0.65">
        {[116, 126].map((x) =>
          [104, 118, 132, 146, 160].map((y) => <rect key={`a${x}-${y}`} x={x} y={y} width="6" height="7" rx="1" />)
        )}
        {[190, 200].map((x) =>
          [96, 110, 124, 138, 152].map((y) => <rect key={`b${x}-${y}`} x={x} y={y} width="6" height="7" rx="1" />)
        )}
        {[260, 270].map((x) =>
          [112, 126, 140, 154].map((y) => <rect key={`c${x}-${y}`} x={x} y={y} width="6" height="7" rx="1" />)
        )}
      </g>

      {/* wind turbines */}
      <g stroke="#6fc79b" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M74 186V96" />
        <path d="M74 96 55 78M74 96l22-12M74 96l4 24" />
        <path d="M332 186v-96" />
        <path d="M332 90l-19-18M332 90l22-12M332 90l4 24" />
      </g>
      <g fill="#4fae74">
        <circle cx="74" cy="96" r="3.4" />
        <circle cx="332" cy="90" r="3.4" />
      </g>

      {/* trees */}
      <g>
        {[
          [22, 150, 20],
          [50, 160, 14],
          [360, 148, 21],
          [386, 162, 14],
          [152, 156, 15],
          [230, 160, 13],
        ].map(([cx, cy, r]) => (
          <g key={`t${cx}`}>
            <rect x={cx - 2.5} y={cy} width="5" height={186 - cy} fill="#3f9a66" />
            <circle cx={cx} cy={cy - r * 0.35} r={r} fill="#42a86e" />
            <circle cx={cx - r * 0.4} cy={cy - r * 0.1} r={r * 0.7} fill="#57bb82" />
          </g>
        ))}
        {[[206, 152], [348, 146]].map(([x, base]) => (
          <g key={`p${x}`} fill="#39925f">
            <rect x={x - 2} y={base + 26} width="4" height="10" />
            <path d={`M${x} ${base}l12 20H${x - 12}z`} />
            <path d={`M${x} ${base + 12}l14 22H${x - 14}z`} />
          </g>
        ))}
      </g>

      {/* ground */}
      <path d="M0 186h400v44H0z" fill="url(#ssbGround)" />
      {/* winding path */}
      <path
        d="M150 230c4-20 26-26 52-30 24-4 40-10 44-24"
        fill="none"
        stroke="#e4f7ea"
        strokeWidth="16"
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* segregated bins */}
      <Bin x={28} y={178} body="#2fae5f" lid="#1c8a48" label="WET" icon="leaf" />
      <Bin x={72} y={178} body="#2f7de0" lid="#1e5cb3" label="DRY" icon="recycle" />
      <Bin x={116} y={178} body="#f5920e" lid="#c9740a" label="HAZARD" icon="hazard" />

      {/* collection truck */}
      <g transform="translate(250,168)">
        <rect x="-6" y="-2" width="14" height="34" rx="3" fill="#2fae5f" />
        <rect x="6" y="-6" width="58" height="38" rx="4" fill="#ffffff" stroke="#2fae5f" strokeWidth="2.5" />
        <g transform="translate(35,13)">
          <circle r="11" fill="none" stroke="#2fae5f" strokeWidth="2" opacity="0.5" />
          <g stroke="#2fae5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
            {[0, 120, 240].map((a) => (
              <path key={a} d="M-4 2.5L0 -1.4l4 3.9" transform={`rotate(${a}) translate(0,-6.4)`} />
            ))}
          </g>
        </g>
        <rect x="64" y="6" width="22" height="26" rx="4" fill="#ffffff" stroke="#2fae5f" strokeWidth="2.5" />
        <rect x="68" y="10" width="14" height="10" rx="2" fill="#d7f0e0" />
        <rect x="80" y="24" width="6" height="4" rx="1" fill="#f5920e" />
        <g fill="#20492f">
          <circle cx="22" cy="34" r="7" />
          <circle cx="72" cy="34" r="7" />
        </g>
        <g fill="#7ccfa4">
          <circle cx="22" cy="34" r="3" />
          <circle cx="72" cy="34" r="3" />
        </g>
      </g>

      {/* floating leaves */}
      <g fill="#7ccfa4" opacity="0.85">
        <path d="M356 64c6-1.2 10.4-4.4 12.6-8.8-6-1-11 2-12.6 8.8z" />
        <path d="M44 88c5-1 8.6-3.6 10.4-7.2-5-.8-9 1.6-10.4 7.2z" />
      </g>
    </svg>
  );
}

function Bin({ x, y, body, lid, label, icon }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="9" y="-11" width="12" height="5" rx="2" fill={lid} />
      <rect x="-2" y="-7" width="34" height="7" rx="3" fill={lid} />
      <path d="M1 2h28l-2.4 28a4 4 0 0 1-4 3.6H7.4a4 4 0 0 1-4-3.6L1 2z" fill={body} />
      <g transform="translate(15,13)" fill="#ffffff">
        {icon === "leaf" && (
          <path d="M6 -5c1 7-3 11-8 11-1.2 0-2-.3-2.6-.8 3.6-1.2 6-3.6 7.2-6.8-2.2 2.4-4.8 3.8-7.6 4.2C-4.8-1.6-1-4.8 6-5z" />
        )}
        {icon === "recycle" && (
          <g stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
            {[0, 120, 240].map((a) => (
              <path key={a} d="M-2.8 1.8L0 -1l2.8 2.8" transform={`rotate(${a}) translate(0,-4.4)`} />
            ))}
          </g>
        )}
        {icon === "hazard" && (
          <>
            <circle cx="0" cy="0" r="2.2" />
            <path d="M-1.6-2.6a5.6 5.6 0 0 1 3.2 0l1.6-5a10 10 0 0 0-6.4 0zM3.2 1.4a5.6 5.6 0 0 1-1.6 2.8l3.4 4a10 10 0 0 0 3.2-5.6zM-3.2 1.4a5.6 5.6 0 0 0 1.6 2.8l-3.4 4a10 10 0 0 1-3.2-5.6z" />
          </>
        )}
      </g>
      <text
        x="15"
        y="27"
        textAnchor="middle"
        fontSize="5.6"
        fontWeight="700"
        fill="#ffffff"
        letterSpacing="0.3"
      >
        {label}
      </text>
    </g>
  );
}
