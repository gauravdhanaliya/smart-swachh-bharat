// The signed-in user's notifications from the EcoSetu API (VITE_USE_API=true).
// The server creates them (a complaint assigned / started / resolved, a
// facility request reviewed); the app only reads them and marks them read.
// Polled like the complaint list: every 30 s, visible tab only, conditional.

import { api } from "./api";
import { createPoller } from "../utils/poller";

const state = { items: [], unread: 0, loaded: false, error: null };
const listeners = new Set();
let last = null;
let inflight = null;
const poller = createPoller(() => refresh());

const notify = () => listeners.forEach((cb) => cb());

export const getState = () => state;

export function refresh() {
  inflight ??= (async () => {
    try {
      const res = await api("/notifications?limit=100", { conditional: true });
      if (res === last && state.loaded && !state.error) return; // unchanged (304)
      last = res;
      Object.assign(state, { items: res.items, unread: res.unread, loaded: true, error: null });
      notify();
    } catch (error) {
      state.error = error;
      notify();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function markAllRead() {
  await api("/notifications/read-all", { method: "POST" });
  await refresh();
}

export function subscribe(callback) {
  listeners.add(callback);
  poller.start();
  return () => {
    listeners.delete(callback);
    if (!listeners.size) poller.stop();
  };
}

export function reset() {
  last = null;
  Object.assign(state, { items: [], unread: 0, loaded: false, error: null });
  notify();
}
