import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import App from "../App";
import { saveProfile } from "../services/profileService";

// The real app at `path`, with the browser bits jsdom lacks stubbed out:
// network (OpenStreetMap / Nominatim) answers empty, and GPS never fixes.
export function renderApp(path = "/") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ elements: [] }), { headers: { "Content-Type": "application/json" } }))
  );
  if (!navigator.geolocation) {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => {} },
    });
  }
  const location = { current: null };
  function LocationProbe() {
    // Test-only probe: recording the location during render keeps it in step
    // with redirects (an effect would lag behind <Navigate>).
    // oxlint-disable-next-line react/immutability
    location.current = useLocation();
    return null;
  }
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>
  );
  return { ...utils, location };
}

/** Empty stores: no complaints, no facilities, no requests. */
export function emptyData() {
  localStorage.setItem("ssb_complaints_v1", "[]");
  localStorage.setItem("ssb_local_api_v1", JSON.stringify({ locations: [], requests: [] }));
}

/** A valid saved profile per role, for tests that start past first-login setup. */
export const TEST_PROFILES = {
  citizen: { fullName: "Asha Verma", mobile: "9876543210", cityId: "roorkee-uk", ward: "Ward 7", address: "12 Civil Lines" },
  worker: { fullName: "Ravi Kumar", mobile: "", cityId: "roorkee-uk", zone: "Zone 3", employeeId: "EMP-42" },
  official: { fullName: "Meera Iyer", mobile: "", cityId: "roorkee-uk", department: "Municipal Corporation", designation: "Sanitation Officer" },
};

/** Saves TEST_PROFILES for the given roles (all three by default). */
export function withProfiles(...roles) {
  for (const role of roles.length ? roles : Object.keys(TEST_PROFILES)) saveProfile(role, TEST_PROFILES[role]);
}
