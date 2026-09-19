const STATUS_STYLES = {
  normal: { label: "Normal", classes: "bg-emerald-100 text-emerald-700" },
  almost_full: { label: "Almost Full", classes: "bg-orange-100 text-orange-700" },
  overflow: { label: "Overflow", classes: "bg-red-100 text-red-700" },
  open: { label: "Open", classes: "bg-emerald-100 text-emerald-700" },
  closed: { label: "Closed", classes: "bg-red-100 text-red-700" },
  maintenance: { label: "Maintenance", classes: "bg-amber-100 text-amber-700" },
  // Step 3 — complaint workflow statuses
  submitted: { label: "Submitted", classes: "bg-slate-200 text-slate-700" },
  assigned: { label: "Assigned", classes: "bg-sky-100 text-sky-700" },
  in_progress: { label: "In Progress", classes: "bg-orange-100 text-orange-700" },
  resolved: { label: "Resolved", classes: "bg-emerald-100 text-emerald-700" },
  // Step 14A — Worker facility-request statuses
  pending: { label: "Pending", classes: "bg-slate-200 text-slate-700" },
  under_review: { label: "Under Review", classes: "bg-sky-100 text-sky-700" },
  approved: { label: "Approved", classes: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", classes: "bg-red-100 text-red-700" },
};

export default function StatusBadge({ status, className = "" }) {
  const key = String(status).toLowerCase().replace(/\s+/g, "_");
  const style = STATUS_STYLES[key] ?? {
    label: status,
    classes: "bg-emerald-100 text-emerald-700",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.classes} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {style.label}
    </span>
  );
}
