import { PILL_ACTIVE, PILL_INACTIVE } from "./buttonStyles";

export default function StatusFilterTabs({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={active ? PILL_ACTIVE : PILL_INACTIVE}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span className={`ml-1.5 ${active ? "text-white/80" : "text-emerald-700/50"}`}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
