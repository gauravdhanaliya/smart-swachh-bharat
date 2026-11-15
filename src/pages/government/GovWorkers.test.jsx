// The official's worker directory: "Add worker" takes a name and an email.
// The email becomes a pending worker role (kept only as a hash and a masked
// copy); the person becomes a Worker once they create and confirm an account
// with that email (server/test/worker-invites.test.js).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/FacilityMap", () => ({ default: () => null }));

import App from "../../App";
import { startSession } from "../../services/authSession";
import { acceptConsentForAll } from "../../test/consent";
import { seedLocalApi } from "../../test/fixtures";
import AddWorkerDialog from "../../components/AddWorkerDialog";

beforeEach(() => {
  seedLocalApi();
  acceptConsentForAll();
  startSession("official", "");
});

const openDialog = async (user) => {
  render(
    <MemoryRouter initialEntries={["/official/workers"]}>
      <App />
    </MemoryRouter>
  );
  await user.click(await screen.findByRole("button", { name: /^add worker$/i }));
  return screen.findByRole("dialog", { name: /add worker/i });
};

describe("Add worker", () => {
  it("asks for a name and an email (area optional), with no phone or role field", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    expect(within(dialog).getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^email$/i)).toHaveAttribute("type", "email");
    expect(within(dialog).getByLabelText(/area/i)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/phone/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/^role$/i)).toBeNull();
    expect(dialog).toHaveAccessibleDescription(/become a worker when they create an ecosetu account with this email/i);
  });

  it("explains a missing name or a bad email under the field, and adds nothing", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(/^email$/i), "nope");
    await user.click(within(dialog).getByRole("button", { name: /^add worker$/i }));
    expect(within(dialog).getByLabelText(/^name$/i)).toHaveAccessibleDescription(/enter the worker's name/i);
    expect(within(dialog).getByLabelText(/^email$/i)).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByLabelText(/^email$/i)).toHaveAccessibleDescription(/valid email address/i);
    expect(localStorage.getItem("ssb_gov_worker_directory_v1")).toBeNull();
  });

  it("adds the worker, shows the masked email and 'Waiting for sign-up', and never keeps the address", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(/^name$/i), "Anita Sharma");
    await user.type(within(dialog).getByLabelText(/^email$/i), "Anita.Sharma@Example.test");
    await user.click(within(dialog).getByRole("button", { name: /^add worker$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const card = screen.getByText("Anita Sharma").closest("div.rounded-2xl");
    expect(within(card).getByText("an***@e***.test")).toBeInTheDocument();
    expect(within(card).getByText("Waiting for sign-up")).toBeInTheDocument();
    expect(JSON.stringify({ ...localStorage }).toLowerCase()).not.toContain("anita.sharma@");
  });
});

describe("the dialog with a server that refuses", () => {
  it("keeps what was typed and shows the server's reason", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("That email is already in the worker directory."));
    const user = userEvent.setup();
    render(<AddWorkerDialog onCancel={() => {}} onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText(/^name$/i), "Ravi");
    await user.type(screen.getByLabelText(/^email$/i), "ravi@example.test");
    await user.click(screen.getByRole("button", { name: /^add worker$/i }));
    expect(onConfirm).toHaveBeenCalledWith({ name: "Ravi", email: "ravi@example.test", area: "", status: "Available" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/already in the worker directory/i);
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("ravi@example.test");
    expect(screen.getByRole("button", { name: /^add worker$/i })).toBeEnabled();
  });

  it("waits while saving: the button says so and can't be pressed twice", async () => {
    let finish;
    const onConfirm = vi.fn(() => new Promise((r) => (finish = r)));
    const user = userEvent.setup();
    render(<AddWorkerDialog onCancel={() => {}} onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText(/^name$/i), "Ravi");
    await user.type(screen.getByLabelText(/^email$/i), "ravi@example.test");
    await user.click(screen.getByRole("button", { name: /^add worker$/i }));
    expect(screen.getByRole("button", { name: /adding/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /adding/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    finish();
  });
});

describe("the privacy hint under the email", () => {
  it("shows the masked form of exactly what was typed", async () => {
    const user = userEvent.setup();
    render(<AddWorkerDialog onCancel={() => {}} onConfirm={() => {}} />);
    const note = () => document.querySelector("[data-email-note]");
    expect(note()).toHaveTextContent("Stored only as a hash and a masked copy, never the address.");
    await user.type(screen.getByLabelText(/^email$/i), "Anita.Sharma@Example.com");
    expect(note()).toHaveTextContent("Stored only as a hash and as an***@e***.com, never the address.");
    await user.clear(screen.getByLabelText(/^email$/i));
    await user.type(screen.getByLabelText(/^email$/i), "ravi@municipal.gov.in");
    expect(note()).toHaveTextContent("as ra***@m***.in");
  });
});
