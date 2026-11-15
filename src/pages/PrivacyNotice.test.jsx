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

// The notice is its own lazily loaded page: wait for it to arrive.
async function openNotice() {
  const view = renderAt("/privacy");
  await screen.findByRole("heading", { level: 1, name: /privacy notice/i });
  return view;
}

const rowFor = (table, name) => within(table).getAllByRole("row").find((r) => within(r).queryByRole("rowheader", { name }));

describe("privacy notice", () => {
  it("is public: it opens without signing in", async () => {
    await openNotice();
    expect(screen.getByRole("heading", { level: 1, name: /privacy notice/i })).toBeInTheDocument();
  });

  it("has a table of what is collected: data, why, where it is stored, whether it is required", async () => {
    await openNotice();
    const table = screen.getByRole("table", { name: /what we collect/i });
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Data", "Why we need it", "Where it is stored", "Required?"]);
    for (const data of [/^account id$/i, /email address and password/i, /location/i, /place searches/i, /photos/i, /ratings and comments/i, /name/i]) {
      expect(rowFor(table, data)).toBeTruthy();
    }
    expect(rowFor(table, /location/i)).toHaveTextContent(/only when you report, never when the app opens/i);
    expect(rowFor(table, /email address and password/i)).toHaveTextContent(/yes, to use the app/i);
    expect(rowFor(table, /email address and password/i)).toHaveTextContent(/keyed one-way hash and a masked copy/i);
    expect(within(table).queryByText(/^phone number$/i)).not.toBeInTheDocument(); // no phone-number row any more
  });

  it("says up front how accounts work: nothing before consent, an email account, nothing anonymous", async () => {
    await openNotice();
    const note = screen.getByRole("note", { name: /how accounts work/i });
    expect(note).toHaveTextContent(/nothing is created until you agree/i);
    expect(note).toHaveTextContent(/email account/i);
    expect(note).toHaveTextContent(/never stores either/i);
    expect(document.body.textContent).not.toMatch(/anonymous account|continue without account|save my account/i);
  });

  it("says what happens to a worker's email an official adds, and to the agreement on the start screen", async () => {
    await openNotice();
    const table = screen.getByRole("table", { name: /what we collect/i });
    expect(rowFor(table, /worker's email, added by an official/i)).toHaveTextContent(/keyed one-way hash.*masked copy.*never the address/i);
    expect(rowFor(table, /your agreement on the start screen/i)).toHaveTextContent(/this browser only, until you sign in/i);
  });

  it("lists every place data goes, with what, why and how long it is kept", async () => {
    await openNotice();
    const table = screen.getByRole("table", { name: /where your data goes/i });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Where", "What", "Why", "How long it is kept"]);
    const firebase = rowFor(table, /firebase authentication/i);
    expect(firebase).toHaveTextContent(/account id, email address and password/i);
    expect(firebase).toHaveTextContent(/email address and password/i);
    expect(firebase).not.toHaveTextContent(/phone|recaptcha|one-time code/i);
    const atlas = rowFor(table, /mongodb atlas/i);
    expect(atlas).toHaveTextContent(ATLAS_REGION);
    expect(atlas).toHaveTextContent(/kept anonymised/i);
    expect(atlas).toHaveTextContent(/“Deleted user”/);
    expect(rowFor(table, /vercel blob/i)).toHaveTextContent(/private/i);
    const logs = rowFor(table, /vercel hosting/i);
    expect(logs).toHaveTextContent(/path without its query/i);
    expect(logs).toHaveTextContent(/never emails, passwords/i);
    expect(logs).toHaveTextContent(/1 hour/i);
    const nominatim = rowFor(table, /nominatim/i);
    expect(nominatim).toHaveTextContent(/third party/i);
    expect(nominatim).toHaveTextContent(/complaint locations/i);
    expect(nominatim).toHaveTextContent(/about 11 m/i);
    expect(nominatim).toHaveTextContent(/map search/i);
    expect(rowFor(table, /map tiles/i)).toBeTruthy();
    expect(rowFor(table, /google fonts/i)).toBeTruthy();
  });

  it("explains the difference between withdrawing consent and deleting data", async () => {
    await openNotice();
    const section = screen.getByRole("region", { name: /withdraw consent or delete your data/i });
    expect(section).toHaveTextContent(/withdraw consent: signs you out.*kept/i);
    expect(section).toHaveTextContent(/delete my data: permanently deletes/i);
  });

  it("explains exactly what deleting your data removes and what it keeps", async () => {
    await openNotice();
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

  it("has a contact line", async () => {
    await openNotice();
    expect(screen.getByRole("region", { name: /contact/i })).toHaveTextContent(PRIVACY_CONTACT);
  });

  it("is linked from the login page", () => {
    renderAt("/login");
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
  });
});
