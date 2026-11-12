import { Component } from "react";
import { logUiError, newReference } from "../utils/uiErrors";

/**
 * App-level error boundary: if a screen crashes, a friendly page with a
 * Reload button and a reference number replaces it — never the error text or
 * a stack. Only the error type and the reference are logged (utils/uiErrors).
 */
export default class AppErrorBoundary extends Component {
  state = { ref: null };

  static getDerivedStateFromError() {
    return { ref: newReference() };
  }

  componentDidCatch(error) {
    logUiError(error, this.state.ref);
  }

  render() {
    if (!this.state.ref) return this.props.children;
    return <ErrorScreen reference={this.state.ref} />;
  }
}

function ErrorScreen({ reference }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-emerald-50/40 px-5">
      <main className="w-full max-w-sm rounded-3xl border border-emerald-100 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 9v4M12 17h.01M10.3 4.3L2.7 18.7A1 1 0 003.6 20h16.8a1 1 0 00.9-1.3L13.7 4.3a1 1 0 00-1.7 0z" />
          </svg>
        </span>
        <h1 className="mt-4 text-xl font-bold text-emerald-950">Something went wrong</h1>
        <p className="mt-2 text-sm text-emerald-900/80">
          Sorry, this screen ran into a problem. Your reports and settings are safe. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => globalThis.location.reload()}
          className="mt-5 min-h-12 w-full cursor-pointer rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Reload
        </button>
        <p className="mt-4 text-xs text-emerald-800/70">If it keeps happening, tell us this reference:</p>
        <p className="mt-1 font-mono text-sm font-semibold tracking-wider text-emerald-950 select-all">{reference}</p>
      </main>
    </div>
  );
}
