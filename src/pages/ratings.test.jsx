// Feature 3: toilet ratings on the screens (browser-only build; the same
// service calls go to the API with VITE_USE_API=true — see apiMode.test.jsx).

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => <div data-testid="facility-map" /> }));

import App from "../App";
import ToiletDetails from "./ToiletDetails";
import { AuthProvider } from "../context/AuthContext";
import { startOtpSession, startSession } from "../services/authSession";
import { resetRatingCache } from "../services/toiletRatingService";
import { LEGACY_BINS, LOCAL_API_KEY, TOILETS, seedLocalApi } from "../test/fixtures";
import { acceptConsentLocally } from "../test/consent";

const PT2 = { ...TOILETS[0], id: "PT-002", name: "Library Toilet" };

function seedRatings(ratings) {
  const db = JSON.parse(localStorage.getItem(LOCAL_API_KEY));
  db.ratings = ratings.map(([toiletId, userId, stars, comment = ""]) => ({
    toiletId,
    userId,
    stars,
    categories: {},
    comment,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
  }));
  localStorage.setItem(LOCAL_API_KEY, JSON.stringify(db));
}

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  seedLocalApi({ locations: [...LEGACY_BINS, ...TOILETS, PT2] });
  resetRatingCache();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => vi.unstubAllGlobals());

const citizen = () => {
  const user = startOtpSession({ uid: "rater-1", phone: "9876543210" });
  acceptConsentLocally(user);
  return user;
};

describe("toilet details: ratings", () => {
  it("a citizen rates the toilet and the average on the page updates", async () => {
    citizen();
    renderApp("/citizen/toilet/PT-001");
    const summary = await screen.findByRole("region", { name: "Ratings" });
    expect(await within(summary).findByText("No ratings yet")).toBeInTheDocument();

    const form = screen.getByRole("form", { name: "Rate this toilet" });
    await userEvent.click(within(form).getByRole("radio", { name: "4 stars" }));
    await userEvent.click(within(form).getByRole("button", { name: /add details/i }));
    await userEvent.click(within(form).getByRole("radio", { name: "Cleanliness: 5" }));
    await userEvent.type(within(form).getByLabelText(/comment/i), "Clean and well lit");
    await userEvent.click(within(form).getByRole("button", { name: "Submit rating" }));

    expect(await screen.findByText(/your rating is saved/i)).toBeInTheDocument();
    expect(within(summary).getByText("4.0")).toBeInTheDocument();
    expect(within(summary).getByText("1 rating")).toBeInTheDocument();
    expect(within(summary).getByText("Cleanliness")).toBeInTheDocument();
    expect(await within(summary).findByText("Clean and well lit")).toBeInTheDocument();
  });

  it("submitting again updates the rating instead of adding a second one", async () => {
    citizen();
    renderApp("/citizen/toilet/PT-001");
    const form = await screen.findByRole("form", { name: "Rate this toilet" });
    await userEvent.click(within(form).getByRole("radio", { name: "5 stars" }));
    await userEvent.click(within(form).getByRole("button", { name: "Submit rating" }));
    await screen.findByText(/your rating is saved/i);

    const again = screen.getByRole("form", { name: "Update your rating" });
    expect(within(again).getByRole("radio", { name: "5 stars" })).toBeChecked();
    await userEvent.click(within(again).getByRole("radio", { name: "2 stars" }));
    await userEvent.click(within(again).getByRole("button", { name: "Update rating" }));

    const summary = screen.getByRole("region", { name: "Ratings" });
    expect(await within(summary).findByText("2.0")).toBeInTheDocument();
    expect(within(summary).getByText("1 rating")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(LOCAL_API_KEY)).ratings).toHaveLength(1);
  });

  it("stars are required, and the error is shown next to them", async () => {
    citizen();
    renderApp("/citizen/toilet/PT-001");
    const form = await screen.findByRole("form", { name: "Rate this toilet" });
    await userEvent.click(within(form).getByRole("button", { name: "Submit rating" }));
    expect(within(form).getByRole("alert")).toHaveTextContent(/choose 1 to 5 stars/i);
    expect(JSON.parse(localStorage.getItem(LOCAL_API_KEY)).ratings ?? []).toHaveLength(0);
  });

  it("comments are shown as plain text, never as HTML", async () => {
    seedRatings([["PT-001", "someone", 3, "<b>bold</b><img src=x onerror=alert(1)>"]]);
    citizen();
    renderApp("/citizen/toilet/PT-001");
    expect(await screen.findByText("<b>bold</b><img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("b, img[src='x']")).toBeNull();
  });

  it("workers and officials see the ratings but no rating form", async () => {
    seedRatings([["PT-001", "someone", 4, "Fine"]]);
    for (const role of ["worker", "official"]) {
      startSession(role, "");
      const { unmount } = render(
        <AuthProvider>
          <MemoryRouter initialEntries={["/t/PT-001"]}>
            <Routes>
              <Route path="/t/:id" element={<ToiletDetails />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );
      const summary = await screen.findByRole("region", { name: "Ratings" });
      expect(within(summary).getByText("4.0")).toBeInTheDocument();
      expect(screen.queryByRole("form", { name: /rate this toilet|update your rating/i })).toBeNull();
      unmount();
    }
  });
});

describe("toilet lists show the average and count", () => {
  it("the citizen map's toilet list", async () => {
    seedRatings([["PT-001", "a", 5], ["PT-001", "b", 4]]);
    citizen();
    renderApp("/citizen/map?filter=toilets");
    expect(await screen.findByText("4.5 · 2 ratings")).toBeInTheDocument();
  });
});

describe("officials: public toilets", () => {
  beforeEach(() => {
    // PT-001: 2.0 from 3 ratings (low rated) · PT-002: 1.0 from 2 ratings (too few to call low rated)
    seedRatings([
      ["PT-001", "a", 1],
      ["PT-001", "b", 2],
      ["PT-001", "c", 3],
      ["PT-002", "d", 1],
      ["PT-002", "e", 1],
    ]);
    const user = startSession("official", "");
    acceptConsentLocally(user);
  });

  it("each toilet shows its average rating and count", async () => {
    renderApp("/official/toilets");
    const card = (await screen.findByText("Main Gate Toilet")).closest("article");
    expect(await within(card).findByText("2.0")).toBeInTheDocument();
    expect(within(card).getByText("3 ratings")).toBeInTheDocument();
  });

  it("the Low rated filter shows only toilets below 3 stars with at least 3 ratings", async () => {
    renderApp("/official/toilets");
    await screen.findByText("3 ratings"); // the summaries have loaded
    await userEvent.click(screen.getByRole("button", { name: /Low rated/ }));
    expect(screen.getByText("Main Gate Toilet")).toBeInTheDocument();
    expect(screen.queryByText("Library Toilet")).toBeNull();
  });

  it("sorts by rating", async () => {
    renderApp("/official/toilets");
    await screen.findByText("3 ratings"); // the summaries have loaded
    await userEvent.selectOptions(screen.getByLabelText("Sort"), "rating-asc");
    const names = screen.getAllByRole("article").map((a) => within(a).getByRole("heading").textContent);
    expect(names.indexOf("Library Toilet")).toBeLessThan(names.indexOf("Main Gate Toilet"));
    await userEvent.selectOptions(screen.getByLabelText("Sort"), "rating-desc");
    const desc = screen.getAllByRole("article").map((a) => within(a).getByRole("heading").textContent);
    expect(desc.indexOf("Main Gate Toilet")).toBeLessThan(desc.indexOf("Library Toilet"));
  });
});
