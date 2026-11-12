/**
 * "Loading…" while a list from the API is on its way, and an alert with a
 * retry if it couldn't load — instead of an empty screen. Renders nothing once
 * the list is there (always, in the browser-only build).
 */
export default function ListLoadStatus({ status, what }) {
  if (status.error) {
    return (
      <div role="alert" className="mx-5 my-3 flex items-center justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
        <span>
          We couldn&apos;t load your {what}. {status.error.message}
        </span>
        <button type="button" onClick={() => status.retry()} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
          Try again
        </button>
      </div>
    );
  }
  if (!status.loaded) {
    return (
      <p role="status" className="mx-5 my-3 text-sm text-slate-500">
        Loading {what}…
      </p>
    );
  }
  return null;
}
