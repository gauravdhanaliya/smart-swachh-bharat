import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import CitySelector from "../components/CitySelector";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { useCity } from "../hooks/useCity";
import { ROLE_HOME } from "../services/authSession";
import { getProfile, saveProfile, validateProfile } from "../services/profileService";

const ROLE_LABEL = { citizen: "Citizen", worker: "Sanitation Worker", official: "Government Official" };

// Extra fields per role, after full name / mobile / city.
const ROLE_FIELDS = {
  citizen: [
    { name: "ward", label: "Ward or locality", placeholder: "e.g. Ward 12, Civil Lines" },
    { name: "address", label: "Address", placeholder: "House number, street, landmark", multiline: true },
  ],
  worker: [
    { name: "zone", label: "Assigned ward or zone", placeholder: "e.g. Ward 7 / Zone B", required: true },
    { name: "employeeId", label: "Employee ID", placeholder: "e.g. EMP-1024" },
  ],
  official: [
    { name: "department", label: "Department", placeholder: "e.g. Municipal Corporation" },
    { name: "designation", label: "Designation", placeholder: "e.g. Sanitation Officer" },
  ],
};

const FIELD =
  "mt-1.5 w-full rounded-2xl border bg-white px-4 py-3 text-sm text-emerald-950 placeholder:text-emerald-800/40 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200";

function Label({ htmlFor, children, required }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-semibold text-emerald-950">
      {children}
      {required ? <span className="text-red-600"> *</span> : <span className="font-normal text-emerald-800/50"> (optional)</span>}
    </label>
  );
}

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-red-600">
      {message}
    </p>
  );
}

/**
 * "Complete your profile" — shown once per role, on first login, before the
 * dashboard. Profile pages reopen it through "Edit details" (router state
 * `{ edit: true }`), pre-filled, and return to the profile page on save.
 */
export default function ProfileSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, isAuthenticated } = useAuth();
  const { cities, selectCity } = useCity();
  const [existing] = useState(() => (role ? getProfile(role) : null));
  const [values, setValues] = useState(() => ({
    fullName: existing?.fullName ?? "",
    mobile: existing?.mobile ?? "",
    cityId: existing?.cityId ?? "",
    ward: existing?.ward ?? "",
    address: existing?.address ?? "",
    zone: existing?.zone ?? "",
    employeeId: existing?.employeeId ?? "",
    department: existing?.department ?? "",
    designation: existing?.designation ?? "",
  }));
  const [errors, setErrors] = useState({});

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const editing = Boolean(existing) || Boolean(location.state?.edit);
  const city = cities.find((c) => c.id === values.cityId) ?? null;

  const set = (name) => (e) => {
    const value = name === "mobile" ? e.target.value.replace(/\D/g, "").slice(0, 10) : e.target.value;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((x) => ({ ...x, [name]: undefined }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const found = validateProfile(role, values);
    setErrors(found);
    if (Object.keys(found).length) return;
    saveProfile(role, values);
    if (role === "citizen") selectCity(values.cityId);
    navigate(editing ? `${ROLE_HOME[role]}/profile` : ROLE_HOME[role], { replace: true });
  };

  return (
    <ScreenShell showBack={editing} onBack={() => navigate(-1)}>
      <h2 className="mt-1 text-center text-2xl font-bold text-emerald-950">
        {editing ? "Edit your details" : "Complete your profile"}
      </h2>
      <p className="mt-1 text-center text-sm text-emerald-800/70">
        {editing
          ? `Update your ${ROLE_LABEL[role]} details.`
          : `Tell us a little about yourself to set up your ${ROLE_LABEL[role]} account.`}
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-4">
        <div>
          <Label htmlFor="profile-fullName" required>Full name</Label>
          <input
            id="profile-fullName"
            type="text"
            value={values.fullName}
            onChange={set("fullName")}
            autoComplete="name"
            maxLength={60}
            placeholder="Enter your full name"
            aria-invalid={Boolean(errors.fullName) || undefined}
            aria-describedby={errors.fullName ? "profile-fullName-error" : undefined}
            className={`${FIELD} ${errors.fullName ? "border-red-400" : "border-emerald-200"}`}
          />
          <FieldError id="profile-fullName-error" message={errors.fullName} />
        </div>

        <div>
          <Label htmlFor="profile-mobile">Mobile number</Label>
          <div className={`mt-1.5 flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200 ${errors.mobile ? "border-red-400" : "border-emerald-200"}`}>
            <span className="text-sm font-medium text-emerald-900">+91</span>
            <input
              id="profile-mobile"
              type="tel"
              inputMode="numeric"
              value={values.mobile}
              onChange={set("mobile")}
              autoComplete="tel-national"
              placeholder="10-digit mobile number"
              aria-invalid={Boolean(errors.mobile) || undefined}
              aria-describedby={errors.mobile ? "profile-mobile-error" : undefined}
              className="min-w-0 flex-1 bg-transparent text-sm text-emerald-950 placeholder:text-emerald-800/40 outline-none"
            />
          </div>
          <FieldError id="profile-mobile-error" message={errors.mobile} />
        </div>

        <div>
          <Label htmlFor="profile-city" required>City</Label>
          <div className="mt-1.5">
            <CitySelector
              variant="field"
              id="profile-city"
              city={city}
              cities={cities}
              invalid={Boolean(errors.cityId)}
              describedBy={errors.cityId ? "profile-city-error" : undefined}
              onSelect={(cityId) => {
                setValues((v) => ({ ...v, cityId }));
                if (errors.cityId) setErrors((x) => ({ ...x, cityId: undefined }));
              }}
            />
          </div>
          <FieldError id="profile-city-error" message={errors.cityId} />
        </div>

        {ROLE_FIELDS[role].map((f) => {
          const id = `profile-${f.name}`;
          const Input = f.multiline ? "textarea" : "input";
          return (
            <div key={f.name}>
              <Label htmlFor={id} required={f.required}>{f.label}</Label>
              <Input
                id={id}
                {...(f.multiline ? { rows: 2 } : { type: "text" })}
                value={values[f.name]}
                onChange={set(f.name)}
                maxLength={f.multiline ? 160 : 60}
                placeholder={f.placeholder}
                aria-invalid={Boolean(errors[f.name]) || undefined}
                aria-describedby={errors[f.name] ? `${id}-error` : undefined}
                className={`${FIELD} ${f.multiline ? "resize-none" : ""} ${errors[f.name] ? "border-red-400" : "border-emerald-200"}`}
              />
              <FieldError id={`${id}-error`} message={errors[f.name]} />
            </div>
          );
        })}

        <PrimaryButton type="submit" className="mt-1">
          {editing ? "Save changes" : "Save and continue"}
        </PrimaryButton>
      </form>
    </ScreenShell>
  );
}
