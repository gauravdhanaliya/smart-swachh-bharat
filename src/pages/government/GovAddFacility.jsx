import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import GovShell from "../../components/GovShell";
import PickLocationMap from "../../components/PickLocationMap";
import IndiaLocationPicker from "../../components/IndiaLocationPicker";
import {
  addGovernmentFacility,
  updateFacility,
  getAllBins,
  getAllToilets,
  getAllBuildings,
} from "../../services/facilityService";
import {
  FACILITY_TYPE,
  FACILITY_TYPES,
  FACILITY_PICK_LOCATIONS,
  CAMPUS_CENTER,
} from "../../data/facilityRequests";
import { BUILDING_TYPES, BUILDING_TYPE_LABELS } from "../../services/locationAdapters";

const BUILDING = "Building";
const ALL_TYPES = [...FACILITY_TYPES, { id: BUILDING, label: "Building", icon: "🏫" }];

const BIN_TYPES = ["Dry Waste", "Wet Waste", "Mixed Waste"];
const TOILET_FACILITY_OPTIONS = ["Men", "Women", "Accessible"];

function normalizedType(raw) {
  if (raw === BUILDING) return BUILDING;
  return raw === FACILITY_TYPE.TOILET ? FACILITY_TYPE.TOILET : FACILITY_TYPE.DUSTBIN;
}

function findForEdit(id) {
  if (!id) return null;
  const bin = getAllBins().find((b) => b.id === id);
  if (bin) return { item: bin, type: FACILITY_TYPE.DUSTBIN };
  const toilet = getAllToilets().find((t) => t.id === id);
  if (toilet) return { item: toilet, type: FACILITY_TYPE.TOILET };
  const building = getAllBuildings().find((b) => b.id === id);
  if (building) return { item: building, type: BUILDING };
  return null;
}

export default function GovAddFacility() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ?edit=<id> turns this page into the Edit form for an existing location.
  const editId = searchParams.get("edit");
  const editing = useMemo(() => findForEdit(editId), [editId]);
  const item = editing?.item;

  const [facilityType, setFacilityType] = useState(
    editing ? editing.type : normalizedType(searchParams.get("type"))
  );
  const [name, setName] = useState(item?.name ?? "");
  const [addressText, setAddressText] = useState(item?.address ?? "");
  const [description, setDescription] = useState(item?.isDemo ? "" : item?.description ?? "");
  const [pickedLocation, setPickedLocation] = useState(null);
  const [latitude, setLatitude] = useState(item ? String(item.latitude) : "");
  const [longitude, setLongitude] = useState(item ? String(item.longitude) : "");

  // Dustbin-only
  const [binType, setBinType] = useState(item?.type && BIN_TYPES.includes(item.type) ? item.type : BIN_TYPES[2]);
  const [fillLevel, setFillLevel] = useState(String(item?.fillLevel ?? 0));

  // Toilet-only
  const [openingHours, setOpeningHours] = useState(item?.openingHours ?? "6:00 AM – 10:00 PM");
  const [facilities, setFacilities] = useState(item?.facilities ?? ["Men", "Women"]);
  const [toiletStatus, setToiletStatus] = useState(item?.status ?? "Open");

  // Building-only
  const [buildingType, setBuildingType] = useState(item?.buildingType ?? BUILDING_TYPES[0]);
  const [serverError, setServerError] = useState("");

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedFacility, setSavedFacility] = useState(null);

  const hasCoords =
    latitude !== "" && longitude !== "" && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude));

  const inRange = hasCoords && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
  const pinned = inRange ? { latitude: Number(latitude), longitude: Number(longitude) } : null;

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
    if (!hasCoords) next.location = "Tap the map or enter coordinates below.";
    else if (!inRange) next.location = "Latitude must be -90 to 90 and longitude -180 to 180.";
    if (facilityType === FACILITY_TYPE.DUSTBIN) {
      const level = Number(fillLevel);
      if (fillLevel !== "" && (Number.isNaN(level) || level < 0 || level > 100)) {
        next.fillLevel = "Fill level must be between 0 and 100.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setSaving(true);
    try {
      const data = {
        facilityType,
        name: name.trim(),
        address: addressText.trim(),
        description: description.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        ...(facilityType === FACILITY_TYPE.DUSTBIN
          ? { type: binType, fillLevel: Number(fillLevel) || 0 }
          : facilityType === FACILITY_TYPE.TOILET
            ? { openingHours: openingHours.trim(), facilities, status: editing ? toiletStatus : undefined }
            : { buildingType }),
      };
      const facility = editing ? await updateFacility(editId, data) : await addGovernmentFacility(data);
      setSavedFacility(facility);
    } catch (err) {
      if (err.fields) {
        setErrors((prev) => ({ ...prev, ...err.fields, location: err.fields.latitude || err.fields.longitude }));
      }
      setServerError(err.message);
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
    const destination =
      facilityType === FACILITY_TYPE.DUSTBIN
        ? "/official/bins"
        : facilityType === FACILITY_TYPE.TOILET
          ? "/official/toilets"
          : "/official/locations";
    const destLabel =
      facilityType === FACILITY_TYPE.DUSTBIN ? "Bins" : facilityType === FACILITY_TYPE.TOILET ? "Toilets" : "Buildings";
    return (
      <GovShell title={editing ? "Edit Location" : "Add Facility"} subtitle="Dustbin, Public Toilet or campus building">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">✅</span>
          <div>
            <p className="text-lg font-bold text-slate-900">{editing ? "Changes saved" : "Facility saved"}</p>
            <p className="mt-1 text-sm text-slate-500">
              {savedFacility.name} ({savedFacility.id}) has been {editing ? "updated" : "added"} and is visible on
              the Government {destLabel} page and on the Citizen Bin &amp; Toilet Map after their next refresh.
            </p>
          </div>
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={() => navigate(destination)}
              className="flex-1 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              View {destLabel}
            </button>
            {!editing && (
              <button
                type="button"
                onClick={handleAddAnother}
                className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Add Another
              </button>
            )}
          </div>
        </div>
      </GovShell>
    );
  }

  return (
    <GovShell
      title={editing ? "Edit Location" : "Add Facility"}
      subtitle={editing ? `Editing ${editId}` : "Directly add a Dustbin, Public Toilet or campus building"}
    >
      {editId && !editing && (
        <p className="mx-auto mb-4 max-w-2xl rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Location {editId} was not found (it may have been removed, or data is still loading).
        </p>
      )}
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl flex-col gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">Facility Type</p>
          <div className="grid grid-cols-3 gap-3">
            {ALL_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={Boolean(editing)}
                onClick={() => setFacilityType(t.id)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  facilityType === t.id
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
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
            placeholder={
              facilityType === FACILITY_TYPE.DUSTBIN
                ? "e.g. Library Entrance Bin"
                : facilityType === FACILITY_TYPE.TOILET
                  ? "e.g. Library Public Toilet"
                  : "e.g. Central Library"
            }
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
          ) : facilityType === BUILDING ? (
            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-900" htmlFor="building-type">
                Building type
              </label>
              <select
                id="building-type"
                value={buildingType}
                onChange={(e) => setBuildingType(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none"
              >
                {BUILDING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {BUILDING_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {errors.type && <p className="mt-1 text-xs font-medium text-red-600">{errors.type}</p>}
            </div>
          ) : (
            <div className="mt-4">
              {editing && (
                <>
                  <label className="block text-sm font-semibold text-slate-900" htmlFor="toilet-status">
                    Status
                  </label>
                  <select
                    id="toilet-status"
                    value={toiletStatus}
                    onChange={(e) => setToiletStatus(e.target.value)}
                    className="mb-4 mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none"
                  >
                    {["Open", "Closed", "Maintenance"].map((st) => (
                      <option key={st}>{st}</option>
                    ))}
                  </select>
                </>
              )}
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

          <p className="mt-3 text-xs font-medium text-slate-500">
            Tap the map to place the pin, or enter exact coordinates below
          </p>
          <PickLocationMap
            value={pinned}
            center={CAMPUS_CENTER}
            onPick={({ latitude: la, longitude: lo }) => {
              setLatitude(String(la));
              setLongitude(String(lo));
              setPickedLocation(null);
              if (errors.location) setErrors((er) => ({ ...er, location: undefined }));
            }}
            className="mt-2 h-64"
          />

          <p className="mt-4 text-xs font-medium text-slate-500">Or search another place in India</p>
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
            placeholder="e.g. COER University, Roorkee"
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
                placeholder="29.8905551"
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
                placeholder="77.9601633"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>
          {errors.location && <p className="mt-2 text-xs font-medium text-red-600">{errors.location}</p>}

          <label className="mt-4 block text-xs font-medium text-slate-500" htmlFor="facility-description">
            Notes (optional)
          </label>
          <input
            id="facility-description"
            type="text"
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none"
          />
        </div>

        {serverError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {serverError}
          </p>
        )}

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
            {saving ? "Saving…" : editing ? "Save Changes" : "Save Facility"}
          </button>
        </div>
      </form>
    </GovShell>
  );
}
