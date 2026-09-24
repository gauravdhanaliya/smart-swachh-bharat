import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import SimpleMap from "../../components/SimpleMap";
import IndiaLocationPicker from "../../components/IndiaLocationPicker";
import { useWorkerSession } from "../../hooks/useWorkerSession";
import { createFacilityRequest } from "../../services/facilityRequestService";
import {
  FACILITY_TYPES,
  FACILITY_PRIORITIES,
  FACILITY_PICK_LOCATIONS,
  REASON_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  MAX_PHOTO_SIZE_BYTES,
  ALLOWED_PHOTO_TYPES,
} from "../../data/facilityRequests";

const LOCATION_MODES = [
  { id: "gps", label: "Current GPS Location" },
  { id: "map", label: "Pick on Map" },
  { id: "manual", label: "Enter Lat/Lng" },
];

export default function WorkerRequestFacility() {
  const navigate = useNavigate();
  const { worker } = useWorkerSession();
  const fileInputRef = useRef(null);

  const [facilityType, setFacilityType] = useState(null);
  const [suggestedName, setSuggestedName] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [photo, setPhoto] = useState(null); // { dataUrl, name }
  const [photoError, setPhotoError] = useState("");

  const [locationMode, setLocationMode] = useState("gps");
  const [gpsStatus, setGpsStatus] = useState("idle"); // idle | locating | done | error
  const [gpsError, setGpsError] = useState("");
  const [pickedLocation, setPickedLocation] = useState(null);
  const [addressText, setAddressText] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const hasCoords =
    latitude !== "" && longitude !== "" && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude));

  const handleUseGps = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGpsStatus("error");
      setGpsError("Geolocation isn't supported in this browser.");
      return;
    }
    setGpsStatus("locating");
    setGpsError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setAddressText((prev) => prev || "My current location");
        setGpsStatus("done");
        if (errors.location) setErrors((er) => ({ ...er, location: undefined }));
      },
      (err) => {
        setGpsStatus("error");
        if (err.code === err.PERMISSION_DENIED) setGpsError("Location permission denied.");
        else if (err.code === err.TIMEOUT) setGpsError("Couldn't get a location fix in time.");
        else setGpsError("Location unavailable right now.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  };

  // "Pick on Map" — search / browse anywhere in India (state -> district ->
  // city), optionally add a locality, or pin the spot with GPS.
  const handlePickMapLocation = (loc) => {
    setPickedLocation(loc);
    if (!loc) {
      setLatitude("");
      setLongitude("");
      return;
    }
    setLatitude(String(loc.latitude));
    setLongitude(String(loc.longitude));
    setAddressText(loc.address);
    if (errors.location) setErrors((er) => ({ ...er, location: undefined }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError("");
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Please upload a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      setPhotoError("Image is too large. Max size is 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto({ dataUrl: reader.result, name: file.name });
    reader.onerror = () => setPhotoError("Couldn't read that image. Please try another one.");
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const next = {};
    if (!facilityType) next.facilityType = "Select a facility type.";
    if (!suggestedName.trim()) next.suggestedName = "Give this facility a short name.";
    if (!hasCoords) next.location = "Provide a location using one of the options above.";
    if (!addressText.trim()) next.address = "Add a short address / location description.";
    if (!reason.trim()) next.reason = "Reason for requirement is required.";
    else if (reason.trim().length < 10) next.reason = "Please add a little more detail (at least 10 characters).";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const request = createFacilityRequest({
        facilityType: facilityType.id,
        suggestedName: suggestedName.trim(),
        location: {
          address: addressText.trim(),
          latitude: Number(latitude),
          longitude: Number(longitude),
        },
        reason: reason.trim(),
        description: description.trim(),
        priority,
        photo: photo?.dataUrl ?? null,
        requestedByWorkerId: worker.id,
        requestedByWorkerName: worker.name,
      });
      navigate(`/worker/facility-requests/${request.id}`, {
        state: { justSubmitted: true },
        replace: true,
      });
    } catch {
      setErrors({ submit: "Something went wrong submitting your request. Please try again." });
      setSubmitting(false);
    }
  };

  return (
    <WorkerShell title="Request Facility" showBack onBack={() => navigate(-1)}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 px-5 py-4">
        <p className="text-sm text-orange-900/70">
          Ask for a new dustbin or public toilet to be added at a location that needs one.
          Your request goes to the Government Official for review.
        </p>

        {/* Facility type */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-900">Facility Type</label>
          <div className="grid grid-cols-2 gap-3">
            {FACILITY_TYPES.map((type) => {
              const selected = facilityType?.id === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    setFacilityType(type);
                    if (errors.facilityType) setErrors((er) => ({ ...er, facilityType: undefined }));
                  }}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
                    selected
                      ? "border-transparent bg-orange-600 text-white shadow-md shadow-orange-900/20"
                      : "border-orange-100 bg-white text-slate-900 hover:border-orange-200"
                  }`}
                >
                  <span className="text-2xl">{type.icon}</span>
                  <span className="text-sm font-semibold leading-tight">{type.label}</span>
                </button>
              );
            })}
          </div>
          {errors.facilityType && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.facilityType}</p>}
        </div>

        {/* Suggested name */}
        <div>
          <label htmlFor="suggestedName" className="mb-1.5 block text-sm font-semibold text-slate-900">
            Suggested Name
          </label>
          <input
            id="suggestedName"
            type="text"
            value={suggestedName}
            onChange={(e) => {
              setSuggestedName(e.target.value);
              if (errors.suggestedName) setErrors((er) => ({ ...er, suggestedName: undefined }));
            }}
            placeholder="e.g. Dustbin near bus stop"
            className="w-full rounded-2xl border border-orange-100 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none"
          />
          {errors.suggestedName && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.suggestedName}</p>}
        </div>

        {/* Location */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-900">Location</label>

          <div className="mb-3 flex gap-2">
            {LOCATION_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setLocationMode(mode.id)}
                className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition ${
                  locationMode === mode.id
                    ? "bg-orange-600 text-white"
                    : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {locationMode === "gps" && (
            <div className="rounded-2xl border border-orange-100 bg-white p-3.5">
              <button
                type="button"
                onClick={handleUseGps}
                className="w-full rounded-full bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                {gpsStatus === "locating" ? "Locating…" : "Use Current GPS Location"}
              </button>
              {gpsStatus === "error" && <p className="mt-2 text-xs font-medium text-red-600">{gpsError}</p>}
              {gpsStatus === "done" && hasCoords && (
                <p className="mt-2 text-xs text-slate-500">
                  Lat: {Number(latitude).toFixed(5)} · Lng: {Number(longitude).toFixed(5)}
                </p>
              )}
            </div>
          )}

          {locationMode === "map" && (
            <div className="rounded-2xl border border-orange-100 bg-white p-3.5">
              <IndiaLocationPicker
                id="worker-facility-location"
                theme="orange"
                value={pickedLocation}
                onChange={handlePickMapLocation}
                presets={FACILITY_PICK_LOCATIONS}
                presetsLabel="Known areas"
              />
              {hasCoords && pickedLocation && (
                <SimpleMap
                  latitude={Number(latitude)}
                  longitude={Number(longitude)}
                  markerLabel={addressText}
                  className="mt-3 h-40"
                  interactive={false}
                />
              )}
            </div>
          )}

          {locationMode === "manual" && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-orange-100 bg-white p-3.5">
              <div>
                <label htmlFor="lat" className="mb-1 block text-xs font-semibold text-slate-600">
                  Latitude
                </label>
                <input
                  id="lat"
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => {
                    setLatitude(e.target.value);
                    if (errors.location) setErrors((er) => ({ ...er, location: undefined }));
                  }}
                  placeholder="26.8467"
                  className="w-full rounded-xl border border-orange-100 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="lng" className="mb-1 block text-xs font-semibold text-slate-600">
                  Longitude
                </label>
                <input
                  id="lng"
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => {
                    setLongitude(e.target.value);
                    if (errors.location) setErrors((er) => ({ ...er, location: undefined }));
                  }}
                  placeholder="80.9462"
                  className="w-full rounded-xl border border-orange-100 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {errors.location && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.location}</p>}
        </div>

        {/* Address / location description */}
        <div>
          <label htmlFor="address" className="mb-1.5 block text-sm font-semibold text-slate-900">
            Address / Location Description
          </label>
          <input
            id="address"
            type="text"
            value={addressText}
            onChange={(e) => {
              setAddressText(e.target.value);
              if (errors.address) setErrors((er) => ({ ...er, address: undefined }));
            }}
            placeholder="e.g. Near IIMT University main gate"
            className="w-full rounded-2xl border border-orange-100 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none"
          />
          {errors.address && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.address}</p>}
        </div>

        {/* Priority */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-900">Priority</label>
          <div className="grid grid-cols-4 gap-2">
            {FACILITY_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`rounded-full px-2 py-2 text-xs font-semibold transition ${
                  priority === p
                    ? "bg-orange-600 text-white"
                    : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label htmlFor="reason" className="mb-1.5 block text-sm font-semibold text-slate-900">
            Reason for Requirement
          </label>
          <textarea
            id="reason"
            rows={3}
            maxLength={REASON_MAX_LENGTH}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (errors.reason) setErrors((er) => ({ ...er, reason: undefined }));
            }}
            placeholder="Why is this facility needed here?"
            className="w-full resize-none rounded-2xl border border-orange-100 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between">
            {errors.reason ? (
              <p className="text-xs font-medium text-red-600">{errors.reason}</p>
            ) : (
              <span />
            )}
            <p className="text-xs text-slate-400">{reason.length}/{REASON_MAX_LENGTH}</p>
          </div>
        </div>

        {/* Optional photo */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-900">Photo (Optional)</label>
          <div className="flex items-center gap-3">
            {photo ? (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-orange-100">
                <img src={photo.dataUrl} alt="Selected facility location" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label="Remove photo"
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-orange-200 text-orange-600 hover:bg-orange-50"
              aria-label="Add photo"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_PHOTO_TYPES.join(",")}
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>
          {photoError && <p className="mt-1.5 text-xs font-medium text-red-600">{photoError}</p>}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-semibold text-slate-900">
            Description
          </label>
          <textarea
            id="description"
            rows={3}
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any other details that would help review this request…"
            className="w-full resize-none rounded-2xl border border-orange-100 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-slate-400">{description.length}/{DESCRIPTION_MAX_LENGTH}</p>
        </div>

        {errors.submit && <p className="text-sm font-medium text-red-600">{errors.submit}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-orange-600 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-orange-900/20 transition active:scale-[0.98] hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
        >
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </form>
    </WorkerShell>
  );
}
