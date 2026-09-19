const COLOR_STYLES = {
  emerald: "bg-emerald-100 text-emerald-700",
  sky: "bg-sky-100 text-sky-700",
  orange: "bg-orange-100 text-orange-700",
  red: "bg-red-100 text-red-700",
  slate: "bg-slate-200 text-slate-700",
};

export default function GovKpiCard({ icon, label, value, sublabel, color = "emerald", onClick }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${COLOR_STYLES[color]}`}>
        {icon}
      </span>
      <div>
        <p className="text-2xl font-bold leading-tight text-slate-900">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      {sublabel && <p className="text-[11px] text-slate-400">{sublabel}</p>}
    </Comp>
  );
}
