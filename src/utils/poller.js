// Polling that costs nothing while nobody is looking.
//
// Every poll is a Vercel function call and an Atlas query, and the Hobby plan
// and the free cluster have small allowances. So the app polls:
//   - every 30 seconds, not every few;
//   - only while the tab is visible (Page Visibility API): a hidden tab makes
//     no requests at all, and showing it again triggers one refresh straight
//     away before the 30-second rhythm resumes;
//   - with conditional requests (services/session.js), so an unchanged list
//     comes back as a 304 with no body.

export const POLL_MS = 30_000;

export function createPoller(refresh, { intervalMs = POLL_MS, doc = typeof document === "undefined" ? null : document } = {}) {
  let timer = null;
  let running = false;
  const visible = () => !doc || doc.visibilityState !== "hidden";
  const run = () => {
    try {
      const result = refresh();
      result?.catch?.(() => {}); // a failed poll is reported by the store, not thrown here
    } catch {
      // ditto
    }
  };
  const startTimer = () => {
    if (!timer) timer = setInterval(run, intervalMs);
  };
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const onVisibility = () => {
    if (!running) return;
    if (visible()) {
      run(); // once, on return
      stopTimer();
      startTimer(); // the rhythm restarts from now
    } else {
      stopTimer();
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      doc?.addEventListener("visibilitychange", onVisibility);
      if (visible()) {
        run();
        startTimer();
      }
    },
    stop() {
      running = false;
      stopTimer();
      doc?.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
