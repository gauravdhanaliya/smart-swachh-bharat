// useLiveBins / useLiveToilets never miss a store update that lands between
// their first render and their subscription (which is what the sign-in
// refresh can do as the first screen mounts).
import { render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  const listeners = new Set();
  const s = {
    bins: [],
    toilets: [],
    set(next) {
      Object.assign(s, next);
      for (const fn of listeners) fn();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return s;
});
vi.mock("../services/facilityService", () => ({
  getAllBins: () => store.bins,
  getAllToilets: () => store.toilets,
  subscribe: (fn) => store.subscribe(fn),
}));

import { useLiveBins } from "./useLiveBins";
import { useLiveToilets } from "./useLiveToilets";

function Lists() {
  const bins = useLiveBins();
  const toilets = useLiveToilets();
  return (
    <p>
      bins:{bins.map((b) => b.id).join(",")} toilets:{toilets.map((t) => t.id).join(",")}
    </p>
  );
}

// Layout effects run after render but before passive effects (where the
// hooks used to subscribe): the store answering in that gap.
function AnswersBeforeSubscribe() {
  useLayoutEffect(() => {
    store.set({ bins: [{ id: "DB-1", status: "normal" }], toilets: [{ id: "PT-1", status: "Open" }] });
  }, []);
  return null;
}

describe("live facility hooks", () => {
  it("pick up an update that lands between the first render and the subscription", () => {
    store.bins = [];
    store.toilets = [];
    render(
      <>
        <Lists />
        <AnswersBeforeSubscribe />
      </>
    );
    expect(screen.getByText(/bins:/)).toHaveTextContent("bins:DB-1 toilets:PT-1");
  });

  it("follow later updates too", async () => {
    store.bins = [];
    store.toilets = [];
    render(<Lists />);
    const { act } = await import("@testing-library/react");
    act(() => store.set({ bins: [{ id: "DB-2", status: "normal" }], toilets: [] }));
    expect(screen.getByText(/bins:/)).toHaveTextContent("bins:DB-2 toilets:");
  });
});
