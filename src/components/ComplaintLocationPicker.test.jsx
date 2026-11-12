// The complaint location picker looks the street address up once the GPS
// position settles, and again only when the pin is dragged more than 25 m.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Leaflet needs a real layout engine. The stub pin has a button that "drags" it.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  useMap: () => ({ setView: () => {} }),
  Marker: ({ eventHandlers }) => (
    <>
      <button type="button" onClick={() => eventHandlers.dragend({ target: { getLatLng: () => globalThis.__dragTo } })}>
        drag pin
      </button>
    </>
  ),
}));
vi.mock("../services/geocode", () => ({ reverseGeocode: vi.fn(async () => "12 Main Road, Roorkee") }));

import ComplaintLocationPicker from "./ComplaintLocationPicker";
import { reverseGeocode } from "../services/geocode";
import { rememberGpsAck } from "../utils/gps";

let onFix;
function Harness() {
  const [value, setValue] = useState(null);
  return <ComplaintLocationPicker value={value} onChange={setValue} />;
}

const BASE = { lat: 29.8645, lng: 77.8964 };
const north = (m) => BASE.lat + m / 111_320;
const fix = (lat, lng, accuracy) => act(() => onFix({ coords: { latitude: lat, longitude: lng, accuracy } }));

beforeEach(() => {
  vi.useFakeTimers();
  reverseGeocode.mockClear();
  rememberGpsAck(); // the GPS notice was already accepted this session
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((ok) => {
        onFix = ok;
        return 1;
      }),
      clearWatch: vi.fn(),
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
});

async function startGps() {
  render(<Harness />);
  fireEvent.click(screen.getAllByRole("button", { name: "Use my current location" })[0]);
}

describe("street address lookups", () => {
  it("10 GPS updates in 2 seconds make exactly one request", async () => {
    await startGps();
    for (let i = 0; i < 10; i++) {
      await fix(north(i * 4), BASE.lng, 400 - i * 30); // sharpening, still over 50 m
      await act(() => vi.advanceTimersByTimeAsync(200));
    }
    expect(reverseGeocode).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("gps-address")).toHaveTextContent("12 Main Road, Roorkee");
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
  });

  it("an accurate fix (under 50 m) is looked up straight away, once", async () => {
    await startGps();
    await fix(BASE.lat, BASE.lng, 200);
    await fix(BASE.lat, BASE.lng, 30);
    await fix(north(2), BASE.lng, 12);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
  });

  it("dragging the pin more than 25 m looks it up again; a small nudge doesn't", async () => {
    await startGps();
    await fix(BASE.lat, BASE.lng, 20);
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    globalThis.__dragTo = { lat: north(10), lng: BASE.lng };
    fireEvent.click(screen.getByRole("button", { name: "drag pin" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/moved by you/)).toBeInTheDocument();
    globalThis.__dragTo = { lat: north(60), lng: BASE.lng };
    fireEvent.click(screen.getByRole("button", { name: "drag pin" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(reverseGeocode).toHaveBeenCalledTimes(2);
    expect(reverseGeocode).toHaveBeenLastCalledWith(Number(north(60).toFixed(6)), BASE.lng);
  });
});
