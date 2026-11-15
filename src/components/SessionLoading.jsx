/**
 * Shown instead of a blank screen while the signed-in session is restored on
 * page load, or (with `message`) while a page's code is still downloading.
 */
export default function SessionLoading({ message = "Restoring your session…" }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-section px-6">
      <p role="status" className="flex items-center gap-3 text-sm font-medium text-emerald-900">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" aria-hidden="true" />
        {message}
      </p>
    </div>
  );
}
