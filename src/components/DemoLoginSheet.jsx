import BottomSheet from "./BottomSheet";
import { RoleIcon } from "./RoleCard";

const DEMO_ROLES = [
  // One short line each: it must fit beside the icon on a 360px screen.
  { id: "citizen", title: "Citizen", description: "Report and track issues" },
  { id: "worker", title: "Sanitation Worker", description: "Your assigned tasks" },
  { id: "official", title: "Government Official", description: "Monitor and manage facilities" },
];

/**
 * "Try the demo": a bottom sheet listing the demo roles (`roles`, by default
 * all three). Tapping one signs in as that role's demo user, with sample
 * data. busyRole: the role being signed in (its row shows progress, the rest
 * wait).
 */
export default function DemoLoginSheet({ open, onClose, onPick, busyRole = null, error = "", roles = ["citizen", "worker", "official"] }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Try the demo" description="Sign in as a sample user. Demo data only, shared by everyone.">
      <div aria-live="assertive">
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
      </div>

      <ul className="mt-2 divide-y divide-emerald-100">
        {DEMO_ROLES.filter((r) => roles.includes(r.id)).map((r) => {
          const busy = busyRole === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r.id)}
                disabled={Boolean(busyRole)}
                aria-busy={busy || undefined}
                className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] cursor-pointer items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:bg-emerald-100/70 btn-disabled-quiet disabled:cursor-wait"
              >
                <RoleIcon id={r.id} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-emerald-950">{r.title}</span>
                  <span data-one-line className="block text-sm leading-snug text-emerald-800/80">
                    {r.description}
                  </span>
                </span>
                {busy ? (
                  <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700 motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
