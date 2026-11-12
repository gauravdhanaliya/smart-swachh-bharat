// Map place search follows Nominatim's usage policy: nothing is sent while
// typing; Search or Enter sends exactly one request; repeats come from the
// cache; a 429 tells the user to try again in a moment.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));

import App from "../App";
import { startSession } from "../services/authSession";
import { resetGeocoder } from "../services/geocode";
import { seedLocalApi } from "../test/fixtures";
import { acceptConsentLocally } from "../test/consent";

let nominatimStatus;
const nominatimCalls = () => fetch.mock.calls.filter(([url]) => String(url).startsWith("https://nominatim.openstreetmap.org/"));

beforeEach(() => {
  seedLocalApi();
  resetGeocoder();
  nominatimStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (!String(url).startsWith("https://nominatim.openstreetmap.org/search")) throw new Error("offline");
      if (nominatimStatus !== 200) return new Response("{}", { status: nominatimStatus });
      return Response.json([{ display_name: "Haridwar, Uttarakhand, India", lat: "29.9457", lon: "78.1642", addresstype: "city" }]);
    })
  );
  const user = startSession("citizen", "");
  acceptConsentLocally(user);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderMap() {
  render(
    <MemoryRouter initialEntries={["/citizen/map"]}>
      <App />
    </MemoryRouter>
  );
  return screen.findByRole("searchbox", { name: /search/i });
}

describe("map place search", () => {
  it("typing a word makes zero requests", async () => {
    const box = await renderMap();
    await userEvent.type(box, "Haridwar");
    await new Promise((r) => setTimeout(r, 50));
    expect(nominatimCalls()).toHaveLength(0);
  });

  it("pressing Search makes exactly one request, and the place can be picked", async () => {
    const box = await renderMap();
    await userEvent.type(box, "Haridwar");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    const place = await screen.findByRole("button", { name: /Haridwar, Uttarakhand, India/ });
    expect(nominatimCalls()).toHaveLength(1);
    const [url, options] = nominatimCalls()[0];
    expect(new URL(url).searchParams.get("countrycodes")).toBe("in");
    expect(options.referrerPolicy).toBe("strict-origin-when-cross-origin");
    await userEvent.click(place);
    expect(await screen.findByText("Haridwar, Uttarakhand, India")).toBeInTheDocument();
  });

  it("Enter searches too; pressing it again for the same words is answered from the cache", async () => {
    const box = await renderMap();
    await userEvent.type(box, "Haridwar{Enter}");
    await screen.findByRole("button", { name: /Haridwar, Uttarakhand, India/ });
    await userEvent.type(box, "{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(nominatimCalls()).toHaveLength(1);
  });

  it("a 429 shows 'Search is busy, try again in a moment'", async () => {
    nominatimStatus = 429;
    const box = await renderMap();
    await userEvent.type(box, "Haridwar{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Search is busy, try again in a moment");
    expect(nominatimCalls()).toHaveLength(1);
  });

  it("bins and toilets still filter as you type, without any request", async () => {
    const box = await renderMap();
    await userEvent.type(box, "Main Gate");
    expect(await screen.findByRole("button", { name: /Main Gate Toilet.*PT-001 ·/ })).toBeInTheDocument();
    await waitFor(() => expect(nominatimCalls()).toHaveLength(0));
  });
});
