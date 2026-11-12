import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/FacilityMap", () => ({ default: () => null }));

import App from "../App";
import { ATLAS_REGION, PRIVACY_CONTACT } from "../data/privacy";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

const rowFor = (table, name) => within(table).getAllByRole("row").find((r) => within(r).queryByRole("rowheader", { name }));

describe("privacy notice", () => {
  it("is public: it opens without signing in", () => {
    renderAt("/privacy");
    expect(screen.getByRole("heading", { level: 1, name: /privacy notice/i })).toBeInTheDocument();
  });

  it("has a table of what is collected: data, why, where it is stored, whether it is required", () => {
    renderAt("/privacy");
    const table = screen.getByRole("table", { name: /what we collect/i });
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Data", "Why we need it", "Where it is stored", "Required?"]);
    for (const data of [/phone number/i, /location/i, /place searches/i, /photos/i, /ratings and comments/i, /name/i]) {
      expect(rowFor(table, data)).toBeTruthy();
    }
    expect(rowFor(table, /location/i)).toHaveTextContent(/only when you report, never when the app opens/i);
  });

  it("lists every place data goes, with what, why and how long it is kept", () => {
    renderAt("/privacy");
    const table = screen.getByRole("table", { name: /where your data goes/i });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Where", "What", "Why", "How long it is kept"]);
    const firebase = rowFor(table, /firebase authentication/i);
    expect(firebase).toHaveTextContent(/phone number/i);
    const atlas = rowFor(table, /mongodb atlas/i);
    expect(atlas).toHaveTextContent(ATLAS_REGION);
    expect(atlas).toHaveTextContent(/kept anonymised/i);
    expect(atlas).toHaveTextContent(/“Deleted user”/);
    expect(rowFor(table, /vercel blob/i)).toHaveTextContent(/private/i);
    const logs = rowFor(table, /vercel hosting/i);
    expect(logs).toHaveTextContent(/path without its query/i);
    expect(logs).toHaveTextContent(/never phone numbers/i);
    expect(logs).toHaveTextContent(/1 hour/i);
    const nominatim = rowFor(table, /nominatim/i);
    expect(nominatim).toHaveTextContent(/third party/i);
    expect(nominatim).toHaveTextContent(/complaint locations/i);
    expect(nominatim).toHaveTextContent(/about 11 m/i);
    expect(nominatim).toHaveTextContent(/map search/i);
    expect(rowFor(table, /map tiles/i)).toBeTruthy();
    expect(rowFor(table, /google fonts/i)).toBeTruthy();
  });

  it("explains the difference between withdrawing consent and deleting data", () => {
    renderAt("/privacy");
    const section = screen.getByRole("region", { name: /withdraw consent or delete your data/i });
    expect(section).toHaveTextContent(/withdraw consent: signs you out.*kept/i);
    expect(section).toHaveTextContent(/delete my data: permanently deletes/i);
  });

  it("explains exactly what deleting your data removes and what it keeps", () => {
    renderAt("/privacy");
    const section = screen.getByRole("region", { name: /deleting your data/i });
    const removed = within(section).getByRole("list", { name: /deleted for good/i });
    for (const item of [/your account/i, /firebase sign-in/i, /photos you attached/i, /toilet ratings/i, /^your notifications$/i, /votes/i, /consent/i]) {
      expect(within(removed).getByText(item)).toBeInTheDocument();
    }
    const kept = within(section).getByRole("list", { name: /kept without your name/i });
    expect(within(kept).getAllByText(/complaints/i).length).toBeGreaterThan(0);
    expect(section).toHaveTextContent(/municipal records/i);
    expect(section).toHaveTextContent(/“Deleted user”/);
    expect(section).toHaveTextContent(/can't be undone/i);
  });

  it("has a contact line", () => {
    renderAt("/privacy");
    expect(screen.getByRole("region", { name: /contact/i })).toHaveTextContent(PRIVACY_CONTACT);
  });

  it("is linked from the login page", () => {
    renderAt("/login");
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
  });
});
