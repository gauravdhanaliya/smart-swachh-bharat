/**
 * A titled card of related settings rows.
 *
 * The Citizen Profile had grown into a flat stack of unrelated controls
 * (stats, a link, demo tools, logout) with nothing telling you which
 * belonged together. Grouping them under short headings means the screen
 * stays scannable as more preferences get added.
 */
export default function SettingsGroup({ title, description, children }) {
  return (
    <section className="flex flex-col gap-1">
      {title && (
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-emerald-700/70">
          {title}
        </h2>
      )}
      <div className="divide-y divide-emerald-100 rounded-2xl border border-emerald-100 bg-white px-4 shadow-sm">
        {children}
      </div>
      {description && <p className="px-1 pt-1 text-xs text-emerald-800/55">{description}</p>}
    </section>
  );
}
