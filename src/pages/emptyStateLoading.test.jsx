// The "nothing added yet" empty states (ported from main's 7cef7da) must not
// flash while the shared list is still loading (API mode, slow network):
// only a loaded, empty list means none were added.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = { loaded: false, error: null, lastSync: null, retry: () => {} };
vi.mock("../hooks/useSyncStatus", () => ({ useSyncStatus: () => sync }));
vi.mock("../hooks/useLiveBins", () => ({ useLiveBins: () => [] }));
vi.mock("../hooks/useLiveToilets", () => ({ useLiveToilets: () => [] }));
vi.mock("../hooks/useLiveBuildings", () => ({ useLiveBuildings: () => [] }));
vi.mock("../hooks/useFacilityRequests", () => ({ useFacilityRequests: () => [] }));
vi.mock("../hooks/useRatingSummaries", () => ({ useRatingSummaries: () => ({}) }));
vi.mock("../components/GovShell", () => ({ default: ({ children }) => <div>{children}</div> }));

import GovBins from "./government/GovBins";
import GovToilets from "./government/GovToilets";
import GovLocations from "./government/GovLocations";
import GovFacilityRequests from "./government/GovFacilityRequests";

const PAGES = [
  ["bins", GovBins, "No bins added yet."],
  ["toilets", GovToilets, "No public toilets added yet."],
  ["buildings", GovLocations, /^No buildings added yet\./],
  ["facility requests", GovFacilityRequests, "No facility requests yet."],
];

const show = (Page) =>
  render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>
  );

describe.each(PAGES)("%s page", (_name, Page, message) => {
  beforeEach(() => {
    sync.loaded = false;
  });

  it("says nothing about 'none added' while the list is still loading", () => {
    show(Page);
    expect(screen.queryByText(message)).toBeNull();
  });

  it("says none were added once the list has loaded empty", () => {
    sync.loaded = true;
    show(Page);
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
