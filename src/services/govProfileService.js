// The Government Official's identity as the official screens use it —
// name, designation, department and city — shown in the sidebar/header
// chip, the Profile page, the Dashboard subtitle and on removal records.
//
// It is read straight from the official's saved profile
// (services/profileService.js, filled in at first login), so there is no
// built-in default officer or district.

import { getProfile, subscribe as subscribeProfiles } from "./profileService";

export function getGovProfile() {
  const p = getProfile("official");
  return {
    name: p?.fullName || "Government Official",
    designation: p?.designation || "",
    department: p?.department || "",
    mobile: p?.mobile || "",
    city: p?.city ?? null,
    cityName: p?.city?.name ?? "",
    state: p?.city?.state ?? "",
    district: p?.city?.district || p?.city?.name || "",
  };
}

/** Coordinates of the official's city, for centring the Dashboard map. */
export function getGovJurisdictionCenter() {
  const city = getProfile("official")?.city;
  return city && Number.isFinite(city.latitude) ? { latitude: city.latitude, longitude: city.longitude } : null;
}

export function subscribe(callback) {
  return subscribeProfiles(callback);
}
