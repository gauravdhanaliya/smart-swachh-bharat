// The whole app is wrapped in the error boundary: a crashing screen shows the
// friendly error page, not a blank one.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pages/PrivacyNotice", () => ({
  default: () => {
    throw new Error("render failed with +91 9876543210 inside");
  },
}));

import App from "./App";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("app error screen", () => {
  it("a screen that crashes shows the error page with Reload and a reference", () => {
    render(
      <MemoryRouter initialEntries={["/privacy"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByText(/^EC-[0-9A-F]{4}-[0-9A-F]{4}$/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("9876543210");
  });
});
