import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";
import { LOG_PREFIX, errorType, logUiError } from "../utils/uiErrors";

const SECRET = "Cannot read 'phone' of undefined at /src/pages/Profile.jsx:42 token=eyJhbGciOi";

function Boom() {
  throw new TypeError(SECRET);
}

let errorSpy;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const ourLogs = () => errorSpy.mock.calls.filter(([first]) => first === LOG_PREFIX);

describe("app error screen", () => {
  it("shows a friendly message, a Reload button and a reference number — never the error text or a stack", () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByText(/^EC-[0-9A-F]{4}-[0-9A-F]{4}$/)).toBeInTheDocument();
    const text = document.body.textContent;
    expect(text).not.toContain("Cannot read");
    expect(text).not.toContain("Profile.jsx");
    expect(text).not.toContain("TypeError");
    expect(text).not.toMatch(/\bat \//);
  });

  it("logs the error type and the reference only", () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );
    const ref = screen.getByText(/^EC-/).textContent;
    expect(ourLogs()).toEqual([[LOG_PREFIX, { type: "TypeError", ref }]]);
    expect(JSON.stringify(ourLogs())).not.toContain("Cannot read");
  });

  it("Reload reloads the page", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("renders its children when nothing goes wrong", () => {
    render(
      <AppErrorBoundary>
        <p>all good</p>
      </AppErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });
});

describe("error logging", () => {
  it("only a plain error type name is logged; anything else becomes 'Error'", () => {
    expect(errorType(new RangeError("x"))).toBe("RangeError");
    expect(errorType({ name: "Weird name with spaces 9876543210" })).toBe("Error");
    expect(errorType("a string thrown")).toBe("Error");
    expect(errorType(null)).toBe("Error");
    logUiError(new Error("contains secrets"), "EC-0000-0000");
    expect(ourLogs()).toEqual([[LOG_PREFIX, { type: "Error", ref: "EC-0000-0000" }]]);
  });
});
