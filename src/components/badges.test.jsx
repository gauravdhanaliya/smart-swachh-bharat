// Ported unchanged from main's 7cef7da components.test (badges).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "./StatusBadge";
import PriorityBadge from "./PriorityBadge";

describe("StatusBadge", () => {
  it.each([
    ["SUBMITTED", "Submitted"],
    ["ASSIGNED", "Assigned"],
    ["IN_PROGRESS", "In Progress"],
    ["RESOLVED", "Resolved"],
    ["PENDING", "Pending"],
    ["UNDER_REVIEW", "Under Review"],
    ["APPROVED", "Approved"],
    ["REJECTED", "Rejected"],
    ["almost_full", "Almost Full"],
    ["Open", "Open"],
  ])("%s renders as %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("falls back to the raw status for unknown values", () => {
    render(<StatusBadge status="Mystery" />);
    expect(screen.getByText("Mystery")).toBeInTheDocument();
  });
});

describe("PriorityBadge", () => {
  it.each(["LOW", "MEDIUM", "HIGH", "CRITICAL"])("renders %s", (p) => {
    const { container } = render(<PriorityBadge priority={p} />);
    expect(screen.getByText(p)).toBeInTheDocument();
    expect(Boolean(container.querySelector("svg"))).toBe(p === "HIGH" || p === "CRITICAL");
  });

  it("styles an unknown priority like MEDIUM", () => {
    render(<PriorityBadge priority="WHATEVER" />);
    expect(screen.getByText("WHATEVER").className).toContain("bg-orange-100");
  });
});

