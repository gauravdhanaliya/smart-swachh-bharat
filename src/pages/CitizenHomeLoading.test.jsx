// While the shared places and the citizen's reports are still loading, the
// Home shows skeletons in their place (not zeros, not an empty map).
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => null }));
vi.mock("../hooks/useSyncStatus", () => ({ useSyncStatus: () => ({ loaded: false, error: null, retry: () => {} }) }));
vi.mock("../hooks/useLiveToilets", () => ({ useLiveToilets: () => [] }));
vi.mock("../hooks/useLiveBins", () => ({ useLiveBins: () => [] }));
vi.mock("../hooks/useComplaints", async (orig) => ({ ...(await orig()), useComplaints: () => [], useComplaintsStatus: () => ({ loaded: false, error: null, retry: () => {} }) }));

import CitizenHome from "./CitizenHome";
import { AuthProvider } from "../context/AuthContext";
import { startEmailSession } from "../services/authSession";

describe("citizen Home while loading", () => {
  it("shows skeletons for the reports, the map and the toilets", async () => {
    startEmailSession({ uid: "me-1", email: "asha@example.test", emailVerified: true });
    render(
      <MemoryRouter>
        <AuthProvider>
          <CitizenHome />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole("button", { name: "My reports: loading" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading the map" })).toBeInTheDocument();
    expect(screen.getByLabelText("Loading toilets")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/no reports yet|no public toilets/i)).toBeNull();
  });
});
