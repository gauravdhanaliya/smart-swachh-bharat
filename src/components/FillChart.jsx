export default function FillChart({ history = [], className = "" }) {
  if (history.length === 0) return null;

  const width = 280;
  const height = 90;
  const padding = 10;
  const max = 100;
  const min = 0;

  const points = history.map((value, i) => {
    const x = padding + (i / (history.length - 1)) * (width - padding * 2);
    const y =
      height -
      padding -
      ((value - min) / (max - min)) * (height - padding * 2);
    return [x, y];
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`)
    .join(" ");

  const areaPath = `${linePath} L${points[points.length - 1][0]},${height - padding} L${points[0][0]},${height - padding} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="fillChartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f9d55" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#1f9d55" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#fillChartGradient)" />
      <path
        d={linePath}
        fill="none"
        stroke="#178a49"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 3.5 : 2} fill="#178a49" />
      ))}
    </svg>
  );
}
