import { describe, expect, it, vi } from "vitest";
import { GEO_BUSY_MESSAGE, MIN_GAP_MS, createGeocoder } from "./geocode";
import { ApiError } from "./api";

// A clock the test moves by hand, and a wait() that records how long it was asked to wait.
function setup(answer = (path) => (path.startsWith("/geo/reverse") ? { address: "Main Road" } : { results: [{ label: path }] })) {
  let t = 10_000;
  const waits = [];
  const call = vi.fn(async (path) => answer(path));
  const geo = createGeocoder({
    call,
    now: () => t,
    wait: async (ms) => {
      waits.push(ms);
      t += ms;
    },
  });
  return { geo, call, waits, advance: (ms) => (t += ms) };
}

describe("place search (Nominatim policy, client side)", () => {
  it("one search is one request; the same search again (any case or spacing) is answered from the cache", async () => {
    const { geo, call } = setup();
    await geo.searchPlaces("Roorkee Station");
    await geo.searchPlaces("  roorkee   STATION ");
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("/geo/search?q=Roorkee%20Station");
  });

  it("pressing Search twice while the first is still loading makes one request", async () => {
    const { geo, call } = setup();
    await Promise.all([geo.searchPlaces("Haridwar"), geo.searchPlaces("Haridwar")]);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("a different search within 1 second waits until the second is up", async () => {
    const { geo, call, waits, advance } = setup();
    await geo.searchPlaces("Haridwar");
    advance(300);
    await geo.searchPlaces("Dehradun");
    expect(call).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([MIN_GAP_MS - 300]);
  });

  it("no wait once a second has passed", async () => {
    const { geo, waits, advance } = setup();
    await geo.searchPlaces("Haridwar");
    advance(MIN_GAP_MS);
    await geo.searchPlaces("Dehradun");
    expect(waits).toEqual([]);
  });

  it("too short to search: no request at all", async () => {
    const { geo, call } = setup();
    expect(await geo.searchPlaces(" a ")).toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });

  it("a 429 becomes 'Search is busy, try again in a moment' and isn't cached", async () => {
    let busy = true;
    const { geo, call, advance } = setup(() => {
      if (busy) throw new ApiError("Too many requests", { status: 429 });
      return { results: [] };
    });
    await expect(geo.searchPlaces("Roorkee")).rejects.toThrow(GEO_BUSY_MESSAGE);
    busy = false;
    advance(MIN_GAP_MS);
    await expect(geo.searchPlaces("Roorkee")).resolves.toEqual([]);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("other failures keep their own message", async () => {
    const { geo } = setup(() => {
      throw new ApiError("Place search isn't available right now.", { status: 502 });
    });
    await expect(geo.searchPlaces("Roorkee")).rejects.toThrow("Place search isn't available right now.");
  });

  it("the cache lasts for the browser session (sessionStorage), shared by new instances", async () => {
    const first = setup();
    await first.geo.searchPlaces("Roorkee");
    const second = setup();
    await second.geo.searchPlaces("roorkee");
    expect(second.call).not.toHaveBeenCalled();
  });

  it("street address: rounded to 4 decimals (about 11 m), cached, and spaced like searches", async () => {
    const { geo, call, waits } = setup();
    expect(await geo.reverseGeocode(29.864512, 77.896381)).toBe("Main Road");
    expect(await geo.reverseGeocode(29.86453, 77.89641)).toBe("Main Road");
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("/geo/reverse?lat=29.8645&lon=77.8964");
    await geo.searchPlaces("Roorkee");
    expect(waits).toEqual([MIN_GAP_MS]);
  });
});
