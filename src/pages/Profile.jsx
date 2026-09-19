import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CitizenShell from "../components/CitizenShell";
import SettingsGroup from "../components/SettingsGroup";
import AddLocationDialog from "../components/AddLocationDialog";
import ToggleSwitch from "../components/ToggleSwitch";
import { useAuth } from "../context/AuthContext";
import { useCity } from "../hooks/useCity";
import { useComplaints } from "../hooks/useComplaints";
import { useCitizenNotifications } from "../hooks/useCitizenNotifications";
import { useCitizenPreferences } from "../hooks/useCitizenPreferences";
import { DEMO_CITIZEN_NAME, STATUS } from "../data/complaints";
import { resetDemoData } from "../services/complaintService";

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-500" {...ICON} strokeWidth="2.4" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function LinkRow({ icon, label, value, badge, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-3.5 text-left">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-emerald-950">{label}</span>
        {value && <span className="block truncate text-xs text-emerald-800/60">{value}</span>}
      </span>
      {badge > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
      <Chevron />
    </button>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { mobileNumber, resetAuth } = useAuth();
  const { city, cities, selectCity, addLocation, removeLocation } = useCity();
  const complaints = useComplaints();
  const { unreadCount } = useCitizenNotifications();
  const { preferences, toggle } = useCitizenPreferences();
  const [resetDone, setResetDone] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [addingLocation, setAddingLocation] = useState(false);

  const resolvedCount = complaints.filter((c) => c.status === STATUS.RESOLVED).length;
  const openCount = complaints.length - resolvedCount;

  const handleLogout = () => {
    resetAuth();
    navigate("/login", { replace: true });
  };

  const handleResetDemoData = () => {
    resetDemoData();
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
  };

  return (
    <CitizenShell>
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h1 className="text-lg font-bold text-emerald-950">Profile</h1>
      </div>

      <div className="flex flex-col gap-5 px-5 pb-8">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl">
            🙂
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-emerald-950">{DEMO_CITIZEN_NAME}</p>
            {mobileNumber && <p className="text-sm text-emerald-800/60">+91 {mobileNumber}</p>}
            <p className="mt-0.5 text-xs text-emerald-800/50">
              {city.state ? `${city.name}, ${city.state}` : city.name}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => navigate("/citizen/complaints")}
            className="rounded-2xl border border-emerald-100 bg-white p-3.5 text-center shadow-sm"
          >
            <p className="text-xl font-bold text-emerald-950">{complaints.length}</p>
            <p className="text-xs text-emerald-800/60">Complaints</p>
          </button>
          <div className="rounded-2xl border border-emerald-100 bg-white p-3.5 text-center shadow-sm">
            <p className="text-xl font-bold text-emerald-950">{openCount}</p>
            <p className="text-xs text-emerald-800/60">Open</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-3.5 text-center shadow-sm">
            <p className="text-xl font-bold text-emerald-950">{resolvedCount}</p>
            <p className="text-xs text-emerald-800/60">Resolved</p>
          </div>
        </div>

        <SettingsGroup title="Activity">
          <LinkRow
            icon="📋"
            label="My Complaints"
            value="Everything you've reported"
            onClick={() => navigate("/citizen/complaints")}
          />
          <LinkRow
            icon="🔔"
            label="Notifications"
            value="Updates on your complaints"
            badge={unreadCount}
            onClick={() => navigate("/citizen/notifications")}
          />
        </SettingsGroup>

        <section className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-emerald-700/70">
            My city
          </h2>
          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <label className="block text-sm font-semibold text-emerald-950" htmlFor="profile-city">
              Home city
            </label>
            <p className="mt-0.5 text-xs text-emerald-800/60">
              Decides which bins, toilets and counts you see on Home and the map.
            </p>
            <select
              id="profile-city"
              value={city.id}
              onChange={(e) => selectCity(e.target.value)}
              className="mt-3 w-full rounded-xl border border-emerald-100 bg-white px-3.5 py-2.5 text-sm font-medium text-emerald-950 focus:border-emerald-500 focus:outline-none"
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.state ? `${c.name}, ${c.state}` : c.name}
                  {c.custom ? " (custom)" : ""}
                </option>
              ))}
            </select>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAddingLocation(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" {...ICON} strokeWidth="2.2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add custom location
              </button>

              {city.custom && (
                <button
                  type="button"
                  onClick={() => removeLocation(city.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600"
                >
                  Remove &ldquo;{city.name}&rdquo;
                </button>
              )}
            </div>
          </div>
        </section>

        <SettingsGroup
          title="Alerts"
          description="Turning a category off hides it from your notifications list and from the bell on Home."
        >
          <ToggleSwitch
            label="Complaint updates"
            description="When a complaint is assigned or work starts"
            checked={preferences.complaintUpdates}
            onChange={() => toggle("complaintUpdates")}
          />
          <ToggleSwitch
            label="Resolution alerts"
            description="When a complaint is marked resolved"
            checked={preferences.resolutionAlerts}
            onChange={() => toggle("resolutionAlerts")}
          />
        </SettingsGroup>

        <SettingsGroup title="Support">
          <LinkRow
            icon="❓"
            label="Help & Support"
            value="FAQs, helplines and how complaints work"
            onClick={() => navigate("/citizen/help")}
          />
        </SettingsGroup>

        <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700/70">
            Demo tools
          </p>
          <p className="mt-1 text-xs text-emerald-800/70">
            Restores the predefined demo complaints for a repeatable SIH presentation. Your alert
            settings are kept.
          </p>
          <button
            type="button"
            onClick={handleResetDemoData}
            className="mt-3 w-full rounded-full border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm active:scale-[0.98]"
          >
            {resetDone ? "Demo data reset ✓" : "Reset Demo Data"}
          </button>
        </div>

        {confirmingLogout ? (
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-emerald-950">Log out of EcoSetu?</p>
            <p className="mt-0.5 text-xs text-emerald-800/60">
              You&apos;ll need your mobile number and OTP to sign back in.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingLogout(false)}
                className="flex-1 rounded-full border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Log out
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingLogout(true)}
            className="flex items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" {...ICON} aria-hidden="true">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            Logout
          </button>
        )}
      </div>

      {addingLocation && (
        <AddLocationDialog
          onCancel={() => setAddingLocation(false)}
          onSave={(data) => {
            addLocation(data);
            setAddingLocation(false);
          }}
        />
      )}
    </CitizenShell>
  );
}
