export default function TaglineStrip({ className = "" }) {
  const items = ["Clean Cities", "Healthy Citizens", "Sustainable Future"];
  return (
    <p
      className={`text-sm text-emerald-700/90 flex flex-wrap items-center justify-center gap-2 ${className}`}
    >
      {items.map((item, i) => (
        <span key={item} className="flex items-center gap-2.5">
          {item}
          {i < items.length - 1 && (
            <span className="px-0.5 text-emerald-300" aria-hidden="true">|</span>
          )}
        </span>
      ))}
    </p>
  );
}
