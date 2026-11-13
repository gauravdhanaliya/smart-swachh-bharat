// This is a hackathon prototype: no screen may attribute it to a ministry.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptConsentForAll } from "../test/consent";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));

import App from "../App";

beforeEach(() => {
  acceptConsentForAll();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => vi.unstubAllGlobals());

describe("no ministry attribution", () => {
  it.each(["/", "/login", "/privacy"])("%s doesn't name the ministry under the logo", async (at) => {
    render(
      <MemoryRouter initialEntries={[at]}>
        <App />
      </MemoryRouter>
    );
    await screen.findAllByText(/smart|swachh/i);
    expect(screen.queryByText(/ministry of housing/i)).not.toBeInTheDocument();
  });
});
