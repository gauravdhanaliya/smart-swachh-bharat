// The citizen map follows the city chosen on Home (until GPS or a picked
// area takes over). In Roorkee, the default, it opens on the COER campus
// where the demo data is; a city with nothing mapped says so instead of
// jumping to the nearest facility hundreds of km away.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll } from "../test/consent";
import { LEGACY_BINS, TOILETS, seedLocalApi } from "../test/fixtures";

// The map canvas needs a real layout engine; the stub records what it was asked to show.
const map = { center: null, zoom: null, bins: [] };
vi.mock("../components/FacilityMap", () => ({
  default: ({ center, zoom, bins = [] }) => {
    Object.assign(map, { center, zoom, bins });
    return <div data-testid="facility-map" />;
  },
}));

import App from "../App";
import { startSession } from "../services/authSession";

const CITY_KEY = "ssb_citizen_city_v1";
const CAMPUS = { latitude: 29.8905551, longitude: 77.9601633 };
const JAIPUR = { latitude: 26.91243, longitude: 75.78727 };

function Probe() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderApp(at) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <App />
      <Probe />
    </MemoryRouter>
  );
}

const jaipurBin = {
  ...LEGACY_BINS[0],
  id: "DB-777",
  name: "Hawa Mahal Bin",
  latitude: 26.9239,
  longitude: 75.8267,
  address: "Hawa Mahal Road, Jaipur",
  status: "normal",
  details: { wasteType: "Dry Waste" },
};

beforeEach(() => {
  acceptConsentForAll();
  startSession("citizen", "Asha");
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  Object.assign(map, { center: null, zoom: null, bins: [] });
});
afterEach(() => vi.unstubAllGlobals());

describe("citizen map and the Home city", () => {
  it("Roorkee (the default) opens on the COER campus, as before", async () => {
    seedLocalApi();
    renderApp("/citizen/map");
    expect(await screen.findByText(/^Showing COER University\./)).toBeInTheDocument();
    expect(map.center).toEqual(CAMPUS);
    expect(map.zoom).toBe(17);
  });

  it("a city with nothing mapped stays on that city and says so", async () => {
    seedLocalApi(); // facilities only in Roorkee
    localStorage.setItem(CITY_KEY, "jaipur-rj");
    renderApp("/citizen/map");
    expect(await screen.findByText(/No bins or toilets are mapped in Jaipur yet\./)).toBeInTheDocument();
    expect(screen.getByText("No bins in Jaipur yet.")).toBeInTheDocument();
    expect(map.center).toEqual(JAIPUR);
    expect(map.zoom).toBe(13);
    expect(map.bins).toEqual([]); // no fallback to Roorkee's bins
  });

  it("a city with facilities centres on that city and lists its own", async () => {
    seedLocalApi({ locations: [...LEGACY_BINS, ...TOILETS, jaipurBin] });
    localStorage.setItem(CITY_KEY, "jaipur-rj");
    renderApp("/citizen/map");
    expect(await screen.findByText(/^Showing Jaipur\./)).toBeInTheDocument();
    // Nothing within 500 m of the centre, so (as for GPS) the map frames the
    // nearest facility, which is Jaipur's own, not one on the Roorkee campus.
    await waitFor(() => expect(map.center).toEqual({ latitude: jaipurBin.latitude, longitude: jaipurBin.longitude }));
    expect(map.bins[0].id).toBe("DB-777");
    expect(screen.queryByText(/mapped in Jaipur yet/)).toBeNull();
  });

  it("picking a city on Home and opening the map follows it", async () => {
    seedLocalApi();
    const user = userEvent.setup();
    renderApp("/citizen");
    await user.click(await screen.findByRole("button", { name: /^Location: Roorkee/ }));
    await user.type(screen.getByPlaceholderText("Search city, district or state..."), "Jaipur");
    const picker = screen.getByRole("dialog", { name: "Choose your location" });
    await user.click(within(picker).getAllByRole("button", { name: /^Jaipur/ })[0]);
    await user.click(screen.getByRole("button", { name: /Open full map/ }));
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/citizen/map"));
    expect(await screen.findByText(/No bins or toilets are mapped in Jaipur yet\./)).toBeInTheDocument();
    expect(map.center).toEqual(JAIPUR);
  });
});

describe("Set area manually", () => {
  it("offers the Home city first, plus the campus areas only when the campus is in that city", async () => {
    seedLocalApi();
    const user = userEvent.setup();
    const first = renderApp("/citizen/map");
    await user.click(await screen.findByRole("button", { name: "Set area manually" }));
    expect(screen.getByText("Your city")).toBeInTheDocument();
    let chips = screen.getByText("Your city").nextElementSibling.querySelectorAll("button");
    expect([...chips].map((b) => b.textContent)[0]).toBe("Roorkee, Uttarakhand");
    expect([...chips].some((b) => /COER University/.test(b.textContent))).toBe(true);
    first.unmount();

    localStorage.setItem(CITY_KEY, "jaipur-rj");
    renderApp("/citizen/map");
    await user.click(await screen.findByRole("button", { name: "Set area manually" }));
    chips = screen.getByText("Your city").nextElementSibling.querySelectorAll("button");
    expect([...chips].map((b) => b.textContent)).toEqual(["Jaipur, Rajasthan"]);
  });
});
