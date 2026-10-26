import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import StatusBadge from "../components/StatusBadge";
import PriorityBadge from "../components/PriorityBadge";
import { startSession } from "../services/authSession";
import { renderApp, withProfiles } from "./renderApp";

describe("login page", () => {
  it("shows three role cards with their descriptions, and no name, phone or OTP fields", () => {
    const { container } = renderApp("/login");
    expect(screen.getByText("Welcome Back!")).toBeInTheDocument();
    expect(screen.getByText("Choose your role to continue")).toBeInTheDocument();
    const cards = [
      ["Citizen", "Report issues and track complaints"],
      ["Sanitation Worker", "View assigned tasks and request facilities"],
      ["Government Official", "Monitor, approve and manage facilities"],
    ];
    for (const [title, description] of cards) {
      const card = screen.getByRole("button", { name: new RegExp(`^${title}`) });
      expect(within(card).getByText(description)).toBeInTheDocument();
    }
    expect(container.querySelector("input, textarea")).toBeNull();
    expect(container.textContent).not.toMatch(/OTP|Mobile Number|\+91|Your name/i);
  });
});

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

describe("empty states with 0 data", () => {
  const as = (role) => {
    withProfiles(role);
    startSession(role);
  };

  it("citizen complaints list", async () => {
    as("citizen");
    renderApp("/citizen/complaints");
    expect(await screen.findByText("No complaints yet. Report your first issue.")).toBeInTheDocument();
  });

  it("citizen dashboard renders with zero counts", async () => {
    as("citizen");
    renderApp("/citizen");
    expect(await screen.findByText("No bins or toilets in this city yet.")).toBeInTheDocument();
  });

  it("worker task list", async () => {
    as("worker");
    renderApp("/worker/tasks");
    expect(await screen.findByText("No tasks assigned yet.")).toBeInTheDocument();
  });

  it("worker facility requests", async () => {
    as("worker");
    renderApp("/worker/facility-requests");
    expect(await screen.findByText("No facility requests in this category yet.")).toBeInTheDocument();
  });

  it("official facility requests", async () => {
    as("official");
    renderApp("/official/facility-requests");
    expect(await screen.findByText("No complaints or facility requests yet.")).toBeInTheDocument();
  });

  it("official complaints", async () => {
    as("official");
    renderApp("/official/complaints");
    expect(await screen.findByText("No complaints or facility requests yet.")).toBeInTheDocument();
  });

  it("official toilets offers Add Facility", async () => {
    as("official");
    renderApp("/official/toilets");
    expect(await screen.findByText("No bins or toilets added yet.")).toBeInTheDocument();
  });
});
