import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import SettingsGroup from "../components/SettingsGroup";
import Icon from "../components/Icon";
import { CARD_BUTTON } from "../components/buttonStyles";
import { STATUS_LABELS, STATUS_ORDER } from "../data/complaints";
import { apiEnabled } from "../services/apiConfig";

// Help & Support for the Citizen app.
//
// Written against what this app actually does, not generic filler: the
// FAQ answers describe the real complaint lifecycle (data/complaints.js),
// the real photo limits (ReportIssue), sign-in (email accounts) and where
// data is kept (EcoSetu's server database and private photo storage), so
// someone tapping through it doesn't find claims the app can't back up.

const APP_VERSION = "1.0.0 (prototype)";
// Where data really lives. The deployed app talks to the EcoSetu server; only
// the offline development build (no API) keeps its demo data in the browser.
const storageLabels = () =>
  apiEnabled()
    ? { data: "Server database (MongoDB Atlas)", photos: "Private storage (Vercel Blob)" }
    : { data: "This browser (offline demo build)", photos: "This browser (offline demo build)" };

const FAQS = [
  {
    q: "How do I report a problem?",
    a: "Tap Report in the bottom bar (or on Home), pick the type of issue, choose a location, and add a photo if you have one. You'll get a complaint ID straight away.",
  },
  {
    q: "Do I need to add a photo?",
    a: "No, it's optional — but a photo helps the sanitation worker find the exact spot, so complaints with one usually get resolved faster. JPG, PNG and WebP up to 3 MB are accepted.",
  },
  {
    q: "How long does a complaint take?",
    a: "High-priority issues like an overflowing bin or a public toilet problem are picked up first. You'll see the status move through the four stages shown below, and you'll get a notification at each step.",
  },
  {
    q: "Can I track a complaint after submitting it?",
    a: "Yes. Open Complaints from the bottom bar, or My Complaints on your profile, and tap any entry to see its full timeline, the assigned worker and the resolution photo once it's done.",
  },
  {
    q: "Why can't I see bins or toilets in my city?",
    a: "The map only shows facilities that have been added for your selected city. If you switch to a city that hasn't been mapped yet, it will honestly show nothing rather than made-up pins.",
  },
  {
    q: "What do the bin statuses mean?",
    a: "Every bin shows one of three statuses. Normal means it has room. Almost Full means it should be collected soon. Overflow means it needs collection now, and is shown in red on the map so it stands out.",
  },
  {
    q: "Do I need to sign up?",
    a: "Yes, with an email and a password (no phone number, no name needed): Create account on the start screen. You can report straight away; confirm your email from the link we send. Your complaints then follow you to any device.",
  },
  {
    q: "Something looks wrong or I'm stuck.",
    a: "Reopen the app to load the latest data. If you're trying the demo, Reset Demo Data on your profile puts it back to its starting state. If that doesn't help, reach out using the contacts above.",
  },
];

const STATUS_HELP = {
  SUBMITTED: "We've received your complaint and given it an ID.",
  ASSIGNED: "A sanitation worker in your ward has been given the job.",
  IN_PROGRESS: "The worker has reached the spot and started clearing it.",
  RESOLVED: "The job is done — you'll see a completion photo and can reopen it if it isn't.",
};

function IconTile({ name }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-section text-emerald-700">
      <Icon name={name} />
    </span>
  );
}

function ContactRow({ icon, label, value, href, note }) {
  const content = (
    <>
      <IconTile name={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-emerald-950">{label}</span>
        <span className="block truncate text-xs text-muted">{value}</span>
        {note && <span className="mt-0.5 block text-xs text-muted">{note}</span>}
      </span>
    </>
  );

  if (!href) {
    return <div className="flex items-center gap-3 py-3">{content}</div>;
  }

  return (
    <a href={href} className="flex min-h-14 items-center gap-3 py-2">
      {content}
      <Icon name="chevronRight" className="h-4 w-4 text-muted" />
    </a>
  );
}

function FaqItem({ faq, open, onToggle }) {
  return (
    <div className="py-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="text-sm font-semibold text-emerald-950">{faq.q}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <p className="pb-3 text-xs leading-relaxed text-emerald-800/70">{faq.a}</p>}
    </div>
  );
}

export default function CitizenHelp() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState(null);
  const storage = storageLabels();

  return (
    <CitizenShell>
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button
          type="button"
          onClick={() => navigate("/citizen/profile")}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-emerald-950">Help &amp; Support</h1>
      </div>

      <div className="flex flex-col gap-5 px-5 pb-8">
        <SettingsGroup title="Common tasks">
          <button
            type="button"
            onClick={() => navigate("/citizen/report")}
            className="flex w-full items-center gap-3 py-3 text-left"
          >
            <IconTile name="note" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-emerald-950">Report an issue</span>
              <span className="block text-xs text-emerald-800/60">Garbage, a damaged bin, a dirty toilet</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/citizen/complaints")}
            className="flex w-full items-center gap-3 py-3 text-left"
          >
            <IconTile name="clipboard" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-emerald-950">Track a complaint</span>
              <span className="block text-xs text-emerald-800/60">See the timeline and assigned worker</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/citizen/map")}
            className="flex w-full items-center gap-3 py-3 text-left"
          >
            <IconTile name="map" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-emerald-950">Find a bin or toilet</span>
              <span className="block text-xs text-emerald-800/60">Nearest facilities in your city</span>
            </span>
          </button>
        </SettingsGroup>

        <SettingsGroup
          title="Talk to someone"
          description="The control room number and email are placeholders for this prototype."
        >
          <ContactRow
            icon="landmark"
            label="City sanitation control room"
            value="1800-000-0000"
            href="tel:18000000000"
            note="Demo number"
          />
          <ContactRow
            icon="mail"
            label="Email support"
            value="support@ecosetu.example"
            href="mailto:support@ecosetu.example"
            note="Demo address"
          />
        </SettingsGroup>

        <section className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            What happens to your complaint
          </h2>
          <ol className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-white p-4">
            {STATUS_ORDER.map((status, index) => (
              <li key={status} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {index + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-emerald-950">
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="block text-xs text-emerald-800/65">{STATUS_HELP[status]}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <SettingsGroup title="Frequently asked">
          {FAQS.map((faq, index) => (
            <FaqItem
              key={faq.q}
              faq={faq}
              open={openFaq === index}
              onToggle={() => setOpenFaq(openFaq === index ? null : index)}
            />
          ))}
        </SettingsGroup>

        <section className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            About EcoSetu
          </h2>
          <div className="rounded-2xl border border-emerald-100 bg-white p-4">
            <p className="text-xs leading-relaxed text-emerald-800/75">
              EcoSetu is a Smart Swachh Bharat prototype. It
              connects citizens, sanitation workers and municipal officials around one shared
              view of bins, public toilets and complaints.
            </p>
            <p data-about-setup className="mt-2 text-xs leading-relaxed text-emerald-800/75">
              You sign in with an email account (Firebase Authentication, Google). Your complaints,
              ratings and profile are kept in EcoSetu&apos;s server database (MongoDB Atlas), and
              photos in private storage (Vercel Blob), never at a public link. It is a prototype:
              nothing is sent to a government system, and the officially supported channel for real
              complaints is the Swachhata app from the Ministry of Housing and Urban Affairs.
            </p>
            <dl className="mt-3 flex flex-col gap-1 border-t border-emerald-100 pt-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted">Version</dt>
                <dd className="font-semibold text-emerald-950">{APP_VERSION}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Data storage</dt>
                <dd className="text-right font-semibold text-emerald-950">{storage.data}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Photos</dt>
                <dd className="text-right font-semibold text-emerald-950">{storage.photos}</dd>
              </div>
            </dl>
          </div>
        </section>

        <button
          type="button"
          onClick={() => navigate("/citizen/report")}
          className={CARD_BUTTON}
        >
          <IconTile name="message" />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-emerald-950">
              Still need help?
            </span>
            <span className="block text-xs text-emerald-800/60">
              Raise it as a complaint and we&apos;ll route it to your ward
            </span>
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </CitizenShell>
  );
}
