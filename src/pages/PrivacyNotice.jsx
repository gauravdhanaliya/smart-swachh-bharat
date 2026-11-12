import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import {
  COLLECTED,
  DELETED_ITEMS,
  DELETE_SUMMARY,
  DESTINATIONS,
  KEPT_ITEMS,
  OSMF_PRIVACY_URL,
  PRIVACY_CONTACT,
  WITHDRAW_SUMMARY,
} from "../data/privacy";

// Public privacy notice (route /privacy): what EcoSetu collects, where each
// piece goes and for how long, the difference between withdrawing consent and
// deleting your data, and exactly what deleting removes. The content lives in
// data/privacy.js, audited against the code.

const SECTION = "rounded-3xl border border-emerald-100 bg-white/90 p-4 shadow-sm";
const TH = "px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-emerald-800/80 uppercase";
const TD = "px-3 py-2.5 align-top text-sm text-emerald-900/85";

function Table({ id, caption, columns, rows }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-emerald-100">
      <table aria-labelledby={id} className="w-full min-w-[640px] border-collapse">
        <thead className="bg-emerald-50/70">
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" className={TH}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-50">
          {rows.map(([head, ...cells]) => (
            <tr key={head}>
              <th scope="row" className={`${TD} font-semibold text-emerald-950`}>
                {head}
              </th>
              {cells.map((cell, i) => (
                <td key={i} className={TD}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <span className="sr-only">{caption}</span>
    </div>
  );
}

export default function PrivacyNotice() {
  const navigate = useNavigate();
  return (
    <ScreenShell showBack>
      <h1 className="mt-2 text-2xl font-bold text-emerald-950">Privacy notice</h1>
      <p className="mt-1 text-sm text-emerald-800/70">What EcoSetu collects, where it goes, how long it is kept, and how to remove it.</p>

      <section aria-labelledby="collect-title" className={`mt-5 ${SECTION}`}>
        <h2 id="collect-title" className="text-base font-bold text-emerald-950">
          What we collect
        </h2>
        <Table
          id="collect-title"
          caption="Scroll sideways to see every column."
          columns={["Data", "Why we need it", "Where it is stored", "Required?"]}
          rows={COLLECTED.map((r) => [r.data, r.why, r.where, r.required])}
        />
      </section>

      <section aria-labelledby="goes-title" className={`mt-4 ${SECTION}`}>
        <h2 id="goes-title" className="text-base font-bold text-emerald-950">
          Where your data goes
        </h2>
        <p className="mt-1 text-sm text-emerald-900/80">Every service that receives data about you, and for how long it is kept.</p>
        <Table
          id="goes-title"
          caption="Scroll sideways to see every column."
          columns={["Where", "What", "Why", "How long it is kept"]}
          rows={DESTINATIONS.map((r) => [r.service, r.data, r.why, r.kept])}
        />
        <p className="mt-2 text-xs text-emerald-800/70">
          OpenStreetMap Foundation privacy policy:{" "}
          <a href={OSMF_PRIVACY_URL} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">
            osmfoundation.org/wiki/Privacy_Policy
          </a>
        </p>
      </section>

      <section aria-labelledby="choices-title" className={`mt-4 ${SECTION}`}>
        <h2 id="choices-title" className="text-base font-bold text-emerald-950">
          Withdraw consent or delete your data
        </h2>
        <ul className="mt-2 space-y-2 text-sm text-emerald-900/85">
          <li className="rounded-2xl bg-emerald-50/70 p-3">{WITHDRAW_SUMMARY}</li>
          <li className="rounded-2xl bg-red-50/70 p-3">{DELETE_SUMMARY}</li>
        </ul>
        <p className="mt-2 text-xs text-emerald-800/70">Both are in your profile, under Privacy and data. The shared demo accounts can&apos;t be deleted.</p>
      </section>

      <section aria-labelledby="delete-title" className={`mt-4 ${SECTION}`}>
        <h2 id="delete-title" className="text-base font-bold text-emerald-950">
          Deleting your data
        </h2>
        <p className="mt-1 text-sm text-emerald-900/80">
          After you type DELETE to confirm and verify your phone number again, this happens and can&apos;t be undone:
        </p>
        <h3 id="deleted-list" className="mt-3 text-sm font-semibold text-emerald-950">
          Deleted for good
        </h3>
        <ul aria-labelledby="deleted-list" className="mt-1 list-disc space-y-1 pl-5 text-sm text-emerald-900/80">
          {DELETED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3 id="kept-list" className="mt-3 text-sm font-semibold text-emerald-950">
          Kept without your name
        </h3>
        <ul aria-labelledby="kept-list" className="mt-1 list-disc space-y-1 pl-5 text-sm text-emerald-900/80">
          {KEPT_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contact-title" className={`mt-4 ${SECTION}`}>
        <h2 id="contact-title" className="text-base font-bold text-emerald-950">
          Contact
        </h2>
        <p className="mt-1 text-sm text-emerald-900/80">Questions about your data: {PRIVACY_CONTACT}</p>
      </section>

      <p className="mt-6 mb-4 text-center text-sm">
        <button type="button" onClick={() => navigate(-1)} className="min-h-11 font-semibold text-emerald-700 underline">
          Back
        </button>
      </p>
    </ScreenShell>
  );
}
