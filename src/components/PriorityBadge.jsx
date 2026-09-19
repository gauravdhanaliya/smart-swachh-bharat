const PRIORITY_STYLES = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-orange-100 text-orange-700",
  LOW: "bg-slate-200 text-slate-700",
};

export default function PriorityBadge({ priority, className = "" }) {
  const classes = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.MEDIUM;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${classes} ${className}`}
    >
      {(priority === "HIGH" || priority === "CRITICAL") && (
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 9v4M12 17h.01M10.3 4.3L2.7 18.7A1 1 0 003.6 20h16.8a1 1 0 00.9-1.3L13.7 4.3a1 1 0 00-1.7 0z" />
        </svg>
      )}
      {priority}
    </span>
  );
}
