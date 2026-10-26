// Self-contained SVG scenes for the Eco Guide — no image files or network
// needed, so they work offline and on the demo deployment.

const SCENES = {
  segregation: { bg: ["#e6f7ec", "#c9edd7"] },
  compost: { bg: ["#f3ecdf", "#e6d8bd"] },
  plastic: { bg: ["#e3f1fb", "#c9e4f6"] },
  water: { bg: ["#dff1fb", "#b9def4"] },
  energy: { bg: ["#fff6d9", "#ffe9a6"] },
  trees: { bg: ["#e6f7ec", "#cdeed8"] },
};

function Bin({ x, color, lid, children }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M0 62h56l-5 58a6 6 0 01-6 5H11a6 6 0 01-6-5z" fill={color} />
      <rect x="-3" y="54" width="62" height="10" rx="4" fill={lid} />
      <rect x="20" y="48" width="16" height="8" rx="3" fill={lid} />
      <path d="M17 76v36M28 76v36M39 76v36" stroke="#fff" strokeOpacity=".25" strokeWidth="3" strokeLinecap="round" />
      {children}
    </g>
  );
}

function Art({ kind }) {
  switch (kind) {
    case "segregation":
      return (
        <>
          <Bin x={62} color="#1f9d55" lid="#0f6e3a">
            <path d="M28 10c-14 4-16 20-4 26 12-4 14-20 4-26z" fill="#1f9d55" transform="translate(0 -2)" />
          </Bin>
          <Bin x={132} color="#2f80d1" lid="#1d5fa6">
            <rect x="20" y="4" width="16" height="30" rx="5" fill="#8cc4f2" />
            <rect x="24" y="0" width="8" height="6" rx="2" fill="#2f80d1" />
          </Bin>
          <Bin x={202} color="#3b4a44" lid="#1f2a26">
            <rect x="14" y="10" width="28" height="18" rx="3" fill="#f5920e" />
            <rect x="42" y="16" width="4" height="6" rx="1" fill="#f5920e" />
          </Bin>
        </>
      );
    case "compost":
      return (
        <>
          <path d="M100 70h120l-12 52a8 8 0 01-8 6h-80a8 8 0 01-8-6z" fill="#8a5a3b" />
          <rect x="94" y="62" width="132" height="12" rx="6" fill="#6b4329" />
          <path d="M160 62c0-18-4-30-14-38 14 0 26 14 24 38z" fill="#1f9d55" />
          <path d="M160 62c0-14 6-26 18-32-2 16-6 26-18 32z" fill="#4cc27a" />
          <path d="M120 100c10-6 22-6 30 0-8 8-22 8-30 0z" fill="#e4a53a" />
          <path d="M175 96c8-5 18-4 24 2-7 7-18 7-24-2z" fill="#c9502f" />
          <path d="M250 40a30 30 0 00-24-10M226 30l7-1M226 30l1 7" stroke="#8a5a3b" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
    case "plastic":
      return (
        <>
          <path d="M90 56h80l6 66a6 6 0 01-6 6H90a6 6 0 01-6-6z" fill="#e0b25a" />
          <path d="M108 56c0-24 44-24 44 0" stroke="#b9862d" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M112 90c6 6 12 8 18 0 6 8 12 6 18 0" stroke="#fff" strokeOpacity=".7" strokeWidth="4" fill="none" strokeLinecap="round" />
          <g transform="translate(208 30)">
            <rect x="14" y="20" width="26" height="70" rx="10" fill="#8cc4f2" />
            <rect x="20" y="8" width="14" height="14" rx="3" fill="#2f80d1" />
            <circle cx="27" cy="55" r="46" fill="none" stroke="#d64545" strokeWidth="7" />
            <path d="M-6 88L60 22" stroke="#d64545" strokeWidth="7" strokeLinecap="round" />
          </g>
        </>
      );
    case "water":
      return (
        <>
          <path d="M160 14c26 34 42 52 42 74a42 42 0 01-84 0c0-22 16-40 42-74z" fill="#3b9de0" />
          <path d="M140 88c0 14 8 24 20 28" stroke="#fff" strokeOpacity=".6" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M70 60c8 12 12 18 12 26a12 12 0 01-24 0c0-8 4-14 12-26z" fill="#79bdf0" />
          <path d="M252 46c8 12 12 18 12 26a12 12 0 01-24 0c0-8 4-14 12-26z" fill="#79bdf0" />
          <path d="M20 128c20-10 40 10 60 0s40 10 60 0 40 10 60 0 40 10 60 0 20 4 40-2" stroke="#3b9de0" strokeOpacity=".5" strokeWidth="5" fill="none" strokeLinecap="round" />
        </>
      );
    case "energy":
      return (
        <>
          <g stroke="#f5920e" strokeWidth="6" strokeLinecap="round">
            <path d="M160 6v14M100 26l10 10M220 26l-10 10M76 76h14M230 76h14" />
          </g>
          <path d="M160 32a44 44 0 00-24 80v10a6 6 0 006 6h36a6 6 0 006-6v-10a44 44 0 00-24-80z" fill="#ffd33d" />
          <rect x="138" y="118" width="44" height="8" rx="4" fill="#9aa5a0" />
          <rect x="146" y="126" width="28" height="7" rx="3.5" fill="#6b7570" />
          <path d="M150 70l10 14 10-14M160 84v22" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "trees":
    default:
      return (
        <>
          <circle cx="262" cy="30" r="16" fill="#ffc94d" />
          <rect x="112" y="80" width="12" height="46" rx="4" fill="#8a5a3b" />
          <circle cx="118" cy="62" r="34" fill="#1f9d55" />
          <circle cx="98" cy="78" r="22" fill="#4cc27a" />
          <rect x="196" y="92" width="10" height="34" rx="4" fill="#8a5a3b" />
          <circle cx="201" cy="78" r="26" fill="#178a49" />
          <circle cx="218" cy="90" r="16" fill="#4cc27a" />
        </>
      );
  }
}

export default function EcoIllustration({ kind = "trees", className = "" }) {
  const scene = SCENES[kind] ?? SCENES.trees;
  const gid = `eco-bg-${kind}`;
  return (
    <svg
      viewBox="0 0 320 140"
      role="img"
      aria-label={`${kind} illustration`}
      className={`w-full rounded-2xl ${className}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={scene.bg[0]} />
          <stop offset="1" stopColor={scene.bg[1]} />
        </linearGradient>
      </defs>
      <rect width="320" height="140" fill={`url(#${gid})`} />
      <Art kind={kind} />
      <rect x="0" y="128" width="320" height="12" fill="#000" opacity=".05" />
    </svg>
  );
}
