import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import PrimaryButton from "../components/PrimaryButton";
import LiveCameraCapture from "../components/LiveCameraCapture";
import { createComplaint } from "../services/complaintService";
import {
  COMPLAINT_TYPES,
  DEMO_LOCATIONS,
  DEMO_CITIZEN_NAME,
  DESCRIPTION_MAX_LENGTH,
  priorityForIssueType,
} from "../data/complaints";

export default function ReportIssue() {
  const navigate = useNavigate();
  const routerLocation = useLocation();

  // Step 4 — Bin/Toilet Details screens can deep-link here with
  // { issueType, location } in router state so the report opens
  // pre-filled (e.g. "Overflowing Bin" + that bin's address).
  const prefill = routerLocation.state ?? {};

  const locations = useMemo(() => {
    if (!prefill.location) return DEMO_LOCATIONS;
    const alreadyListed = DEMO_LOCATIONS.some(
      (loc) => loc.address === prefill.location.address
    );
    return alreadyListed ? DEMO_LOCATIONS : [prefill.location, ...DEMO_LOCATIONS];
  }, [prefill.location]);

  const prefillLocationIndex = useMemo(() => {
    if (!prefill.location) return "";
    const idx = locations.findIndex((loc) => loc.address === prefill.location.address);
    return idx === -1 ? "" : String(idx);
  }, [locations, prefill.location]);

  const [issueType, setIssueType] = useState(
    () => COMPLAINT_TYPES.find((t) => t.label === prefill.issueType) ?? null
  );
  const [locationIndex, setLocationIndex] = useState(prefillLocationIndex);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState(null); // { dataUrl }
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next = {};
    if (!issueType) next.issueType = "Select a complaint type.";
    if (locationIndex === "") next.location = "Select a location.";
    if (!description.trim()) next.description = "Description is required.";
    else if (description.trim().length < 10)
      next.description = "Please add a little more detail (at least 10 characters).";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const location = locations[Number(locationIndex)];
      const complaint = createComplaint({
        citizenName: DEMO_CITIZEN_NAME,
        issueType: issueType.label,
        description: description.trim(),
        location,
        priority: priorityForIssueType(issueType.label),
        photo: photo?.dataUrl ?? null,
      });
      navigate(`/citizen/complaints/${complaint.id}`, {
        state: { justSubmitted: true },
        replace: true,
      });
    } catch {
      setErrors({ submit: "Something went wrong submitting your report. Please try again." });
      setSubmitting(false);
    }
  };

  return (
    <CitizenShell>
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-emerald-950">Report an Issue</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 px-5 pb-8">
        <p className="text-sm text-emerald-800/70">
          Help us keep your city clean. Report an overflowing bin, dirty area, or any
          sanitation issue.
        </p>

        {prefill.location?.facilityId && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs font-medium text-emerald-800">
            <span className="text-base">
              {prefill.location.facilityType === "Public Toilet" ? "🚻" : "🗑️"}
            </span>
            Reporting for {prefill.location.facilityType} {prefill.location.facilityId} at{" "}
            {prefill.location.address}
          </div>
        )}

        <div>
          <div className="grid grid-cols-2 gap-3">
            {COMPLAINT_TYPES.map((type) => {
              const selected = issueType?.id === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    setIssueType(type);
                    if (errors.issueType) setErrors((e) => ({ ...e, issueType: undefined }));
                  }}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
                    selected
                      ? "border-transparent bg-emerald-700 text-white shadow-md shadow-emerald-900/20"
                      : "border-emerald-100 bg-white text-emerald-900 hover:border-emerald-200"
                  }`}
                >
                  <span className="text-2xl">{type.icon}</span>
                  <span className="text-sm font-semibold leading-tight">{type.label}</span>
                </button>
              );
            })}
          </div>
          {errors.issueType && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.issueType}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-emerald-950">
            Add a Photo (Live Camera)
          </label>
          <p className="mb-2 text-xs text-emerald-800/60">
            Only a live photo taken right now is accepted — this keeps reports honest and
            tied to the actual spot.
          </p>
          <LiveCameraCapture
            photo={photo}
            onCapture={(dataUrl) => setPhoto({ dataUrl })}
            onRetake={() => setPhoto(null)}
          />
        </div>

        <div>
          <label htmlFor="location" className="mb-1.5 block text-sm font-semibold text-emerald-950">
            Location
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
            </span>
            <select
              id="location"
              value={locationIndex}
              onChange={(e) => {
                setLocationIndex(e.target.value);
                if (errors.location) setErrors((er) => ({ ...er, location: undefined }));
              }}
              className="w-full appearance-none rounded-2xl border border-emerald-100 bg-white py-3 pl-10 pr-9 text-sm text-emerald-950 focus:border-emerald-400 focus:outline-none"
            >
              <option value="" disabled>
                Select a location…
              </option>
              {locations.map((loc, i) => (
                <option key={loc.address} value={i}>
                  {loc.address}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-500">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </div>
          {errors.location && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.location}</p>}
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-semibold text-emerald-950">
            Additional Details
          </label>
          <textarea
            id="description"
            rows={4}
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (errors.description) setErrors((er) => ({ ...er, description: undefined }));
            }}
            placeholder="Write more about the issue…"
            className="w-full resize-none rounded-2xl border border-emerald-100 bg-white p-3.5 text-sm text-emerald-950 placeholder:text-emerald-800/40 focus:border-emerald-400 focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between">
            {errors.description ? (
              <p className="text-xs font-medium text-red-600">{errors.description}</p>
            ) : (
              <span />
            )}
            <p className="text-xs text-emerald-800/40">
              {description.length}/{DESCRIPTION_MAX_LENGTH}
            </p>
          </div>
        </div>

        {errors.submit && <p className="text-sm font-medium text-red-600">{errors.submit}</p>}

        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Report"}
        </PrimaryButton>
      </form>
    </CitizenShell>
  );
}
