import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import GovShell from "../../components/GovShell";
import SimpleMap from "../../components/SimpleMap";
import IndiaLocationPicker from "../../components/IndiaLocationPicker";
import { addGovernmentFacility } from "../../services/facilityService";
import { FACILITY_TYPE, FACILITY_TYPES, FACILITY_PICK_LOCATIONS } from "../../data/facilityRequests";

const BIN_TYPES = ["Dry Waste", "Wet Waste", "Mixed Waste"];
const TOILET_FACILITY_OPTIONS = ["Men", "Women", "Accessible"];

function normalizedType(raw) {
  return raw === FACILITY_TYPE.TOILET ? FACILITY_TYPE.TOILET : FACILITY_TYPE.DUSTBIN;
}

export default function GovAddFacility() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [facilityType, setFacilityType] = useState(normalizedType(searchParams.get("type")));
  const [name, setName] = useState("");
  const [addressText, setAddressText] = useState("");
  const [pickedLocation, setPickedLocation] = useState(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  // Dustbin-only
  const [binType, setBinType] = useState(BIN_TYPES[2]);
  const [fillLevel, setFillLevel] = useState("0");

  // Toilet-only
  const [openingHours, setOpeningHours] = useState("6:00 AM – 10:00 PM");
  const [facilities, setFacilities] = useState(["Men", "Women"]);

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedFacility, setSavedFacility] = useState(null);

  const hasCoords =
    latitude !== "" && longitude !== "" && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude));

  const previewCenter = useMemo(
    () =>
      hasCoords
        ? { latitude: Number(latitude), longitude: Number(longitude) }
        : { latitude: 26.8467, longitude: 80.9462 }, // Lucknow fallback
    [hasCoords, latitude, longitude]
  );

  // Any place in India: search, or State -> District -> City, plus an
  // optional locality / GPS pin. Coordinates and address fill in below and
  // can still be fine-tuned by hand.
  const handlePickLocation = (loc) => {
    setPickedLocation(loc);
    if (!loc) return;
    setLatitude(String(loc.latitude));
    setLongitude(String(loc.longitude));
    setAddressText(loc.address);
    if (errors.location) setErrors((e) => ({ ...e, location: undefined }));
  };

  const toggleFacility = (option) => {
    setFacilities((prev) =>
      prev.includes(option) ? prev.filter((f) => f !== option) : [...prev, option]
    );
  };

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = "Give this facility a short name.";
    if (!addressText.trim()) next.address = "Add a short address / location description.";
    if (!hasCoords) next.location = "Provide coordinates using one of the options below.";
    if (facilityType === FACILITY_TYPE.DUSTBIN) {
      const level = Number(fillLevel);
      if (fillLevel !== "" && (Number.isNaN(level) || level < 0 || level > 100)) {
        next.fillLevel = "Fill level must be between 0 and 100.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const facility = addGovernmentFacility({
        facilityType,
        name: name.trim(),
        address: addressText.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        ...(facilityType === FACILITY_TYPE.DUSTBIN
          ? { type: binType, fillLevel: Number(fillLevel) || 0 }
          : { openingHours: openingHours.trim(), facilities }),
      });
      setSavedFacility(facility);
    } finally {
      setSaving(false);
    }
  };

  const handleAddAnother = () => {
    setSavedFacility(null);
    setName("");
    setAddressText("");
    setPickedLocation(null);
    setLatitude("");
    setLongitude("");
    setFillLevel("0");
    setErrors({});
  };

  if (savedFacility) {
    const destination = facilityType === FACILITY_TYPE.DUSTBIN ? "/official/bins" : "/official/toilets";
    return (
      <GovShell title="Add Facility" subtitle="Directly add a Dustbin or Public Toilet">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">✅</span>
          <div>
            <p className="text-lg font-bold text-slate-900">Facility saved</p>
            <p className="mt-1 text-sm text-slate-500">
              {savedFacility.name} ({savedFacility.id}) has been added and is now visible on the Government{" "}
              {facilityType === FACILITY_TYPE.DUSTBIN ? "Bins" : "Public Toilets"} page and on the Citizen Bin
              &amp; Toilet Map.
            </p>
          </div>
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={() => navigate(destination)}
              className="flex-1 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              View {facilityType === FACILITY_TYPE.DUSTBIN ? "Bins" : "Toilets"}
            </button>
            <button
              type="button"
              onClick={handleAddAnother}
              className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Add Another
            </button>
          </div>
        </div>
      </GovShell>
    );
  }

  return (
    <GovShell title="Add Facility" subtitle="Directly add a Dustbin or Public Toilet">
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl flex-col gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">Facility Type</p>
          <div className="grid grid-cols-2 gap-3">
            {FACILITY_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFacilityType(t.id)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  facilityType === t.id
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-900" htmlFor="facility-name">
            Name
          </label>
          <input
            id="facility-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={facilityType === FACILITY_TYPE.DUSTBIN ? "e.g. Charbagh Main Road Bin" : "e.g. Charbagh Public Toilet"}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
          />
          {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}

          {facilityType === FACILITY_TYPE.DUSTBIN ? (
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900">Waste Type</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {BIN_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBinType(t)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                      binType === t
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-sm font-semibold text-slate-900" htmlFor="facility-fill">
                Initial Fill Level (%)
              </label>
              <input
                id="facility-fill"
                type="number"
                min="0"
                max="100"
                value={fillLevel}
                onChange={(e) => setFillLevel(e.target.value)}
                className="mt-1.5 w-32 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none"
              />
              {errors.fillLevel && <p className="mt-1 text-xs font-medium text-red-600">{errors.fillLevel}</p>}
            </div>
          ) : (
            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-900" htmlFor="facility-hours">
                Opening Hours
              </label>
              <input
                id="facility-hours"
                type="text"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                placeholder="e.g. 6:00 AM – 10:00 PM"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />

              <p className="mt-4 text-sm font-semibold text-slate-900">Facilities</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {TOILET_FACILITY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleFacility(option)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                      facilities.includes(option)
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Location</p>

          <p className="mt-3 text-xs font-medium text-slate-500">Pick an area anywhere in India</p>
          <div className="mt-1.5">
            <IndiaLocationPicker
              id="gov-facility-location"
              theme="sky"
              value={pickedLocation}
              onChange={handlePickLocation}
              presets={FACILITY_PICK_LOCATIONS}
              presetsLabel="Known areas"
            />
          </div>

          <label className="mt-4 block text-xs font-medium text-slate-500" htmlFor="facility-address">
            Address
          </label>
          <input
            id="facility-address"
            type="text"
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            placeholder="e.g. Gomti Nagar, Lucknow"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
          />
          {errors.address && <p className="mt-1 text-xs font-medium text-red-600">{errors.address}</p>}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500" htmlFor="facility-lat">
                Latitude
              </label>
              <input
                id="facility-lat"
                type="text"
                inputMode="decimal"
                value={latitude}
                onChange={(e) => {
                  setLatitude(e.target.value);
                  if (errors.location) setErrors((er) => ({ ...er, location: undefined }));
                }}
                placeholder="26.8467"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500" htmlFor="facility-lng">
                Longitude
              </label>
              <input
                id="facility-lng"
                type="text"
                inputMode="decimal"
                value={longitude}
                onChange={(e) => {
                  setLongitude(e.target.value);
                  if (errors.location) setErrors((er) => ({ ...er, location: undefined }));
                }}
                placeholder="80.9462"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>
          {errors.location && <p className="mt-2 text-xs font-medium text-red-600">{errors.location}</p>}

          {hasCoords && (
            <SimpleMap
              latitude={previewCenter.latitude}
              longitude={previewCenter.longitude}
              zoom={15}
              markerLabel={name || "New facility"}
              className="mt-4 h-48"
            />
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Facility"}
          </button>
        </div>
      </form>
    </GovShell>
  );
}
