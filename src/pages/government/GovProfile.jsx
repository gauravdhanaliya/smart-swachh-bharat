import { useEffect, useState } from "react";
import GovShell from "../../components/GovShell";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { resetDemoData } from "../../services/complaintService";
import { useGovProfile, govInitials } from "../../hooks/useGovProfile";
import {
  getJurisdictionsForState,
  getStateForProfile,
} from "../../services/govProfileService";
import { STATES_ONLY, UNION_TERRITORIES } from "../../data/indianStates";

const field =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none";

export default function GovProfile() {
  const { mobileNumber, resetAuth } = useAuth();
  const navigate = useNavigate();
  const { profile, updateProfile } = useGovProfile();
  const [resetDone, setResetDone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);

  // Re-seed the draft whenever a fresh profile arrives (entering edit
  // mode, or another tab changing it while this one is open).
  useEffect(() => {
    if (!editing) setDraft({ ...profile, state: getStateForProfile(profile) });
  }, [profile, editing]);

  const profileState = getStateForProfile(profile);
  const districtOptions = getJurisdictionsForState(draft.state);

  // Changing the state changes which districts are on offer, so move the
  // draft to that state's first one (its capital) — a district from the
  // previous state would otherwise be left selected.
  const handleStateChange = (e) => {
    const nextState = e.target.value;
    const nextDistricts = getJurisdictionsForState(nextState);
    setDraft((d) => ({
      ...d,
      state: nextState,
      district: nextDistricts.some((j) => j.name === d.district)
        ? d.district
        : nextDistricts[0]?.name ?? "",
    }));
  };

  const handleLogout = () => {
    resetAuth();
    navigate("/login", { replace: true });
  };

  const handleResetDemoData = () => {
    resetDemoData();
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
  };

  const handleSave = (e) => {
    e.preventDefault();
    updateProfile({
      name: draft.name.trim() || "District Officer",
      state: draft.state,
      district: draft.district,
      ministry: draft.ministry.trim() || "Ministry of Housing & Urban Affairs",
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft({ ...profile, state: getStateForProfile(profile) });
    setEditing(false);
  };

  return (
    <GovShell title="Profile" subtitle="Government Official account">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {editing ? (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-xl font-bold text-sky-700">
                {govInitials(draft.name)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500" htmlFor="gov-name">
                Name / title
              </label>
              <input
                id="gov-name"
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. District Officer, or your name"
                className={field}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500" htmlFor="gov-state">
                  State / UT
                </label>
                <select
                  id="gov-state"
                  value={draft.state}
                  onChange={handleStateChange}
                  className={field}
                >
                  <optgroup label="States">
                    {STATES_ONLY.map((st) => (
                      <option key={st.name} value={st.name}>
                        {st.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Union Territories">
                    {UNION_TERRITORIES.map((st) => (
                      <option key={st.name} value={st.name}>
                        {st.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500" htmlFor="gov-district">
                  District / City
                </label>
                <select
                  id="gov-district"
                  value={draft.district}
                  onChange={(e) => setDraft((d) => ({ ...d, district: e.target.value }))}
                  className={field}
                >
                  {districtOptions.map((j) => (
                    <option key={j.name} value={j.name}>
                      {j.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-slate-400">
              Choose your state first, then a district / city in it. Also updates the
              Dashboard&apos;s default map view.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-500" htmlFor="gov-ministry">
                Department / ministry
              </label>
              <input
                id="gov-ministry"
                type="text"
                value={draft.ministry}
                onChange={(e) => setDraft((d) => ({ ...d, ministry: e.target.value }))}
                placeholder="e.g. Ministry of Housing & Urban Affairs"
                className={field}
              />
            </div>

            <div className="mt-1 flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-xl font-bold text-sky-700">
              {govInitials(profile.name)}
            </span>
            <p className="mt-3 text-lg font-bold text-slate-900">{profile.name}</p>
            <p className="text-sm text-slate-500">
              {profile.district}, {profileState} &middot; {profile.ministry}
            </p>
            {mobileNumber && <p className="mt-1 text-xs text-slate-400">+91 {mobileNumber}</p>}

            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
              Edit profile
            </button>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-left">
              <div>
                <p className="text-xs text-slate-400">Role</p>
                <p className="text-sm font-medium text-slate-800">Government Official</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Jurisdiction</p>
                <p className="text-sm font-medium text-slate-800">{profile.district}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">State</p>
                <p className="text-sm font-medium text-slate-800">{profileState}</p>
              </div>
            </div>
          </div>
        )}

        {!editing && (
          <>
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Demo tools
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Restores the predefined demo complaints for a repeatable SIH presentation. Your
                profile details are kept.
              </p>
              <button
                type="button"
                onClick={handleResetDemoData}
                className="mt-3 w-full rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm active:scale-[0.98]"
              >
                {resetDone ? "Demo data reset ✓" : "Reset Demo Data"}
              </button>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
            >
              Logout
            </button>
          </>
        )}
      </div>
    </GovShell>
  );
}
