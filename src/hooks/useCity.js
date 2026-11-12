import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CITY_ID,
  addCustomCity,
  getAllCities,
  removeCustomCity,
  subscribe as subscribeCities,
} from "../services/cityService";

// The citizen's chosen city, remembered in localStorage (demo persistence,
// same approach as the rest of the app). The list is no longer the static
// six from data/cities.js — services/cityService.js merges in any custom
// location the citizen has added, and this hook subscribes so adding one
// on the Profile immediately shows up in the Home city picker.
const STORAGE_KEY = "ssb_citizen_city_v1";

function readCityId(cities) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (cities.some((c) => c.id === saved)) return saved;
  } catch {
    // storage blocked — use default
  }
  return DEFAULT_CITY_ID;
}

function persistCityId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage blocked — selection still works for this session
  }
}

export function useCity() {
  const [cities, setCities] = useState(getAllCities);
  const [cityId, setCityId] = useState(() => readCityId(getAllCities()));

  useEffect(() => subscribeCities(() => setCities(getAllCities())), []);

  const selectCity = useCallback((id) => {
    if (!getAllCities().some((c) => c.id === id)) return;
    setCityId(id);
    persistCityId(id);
  }, []);

  // Adding a location is almost always followed by wanting to use it,
  // so this selects it too rather than making it a second step.
  const addLocation = useCallback((data) => {
    const city = addCustomCity(data);
    setCityId(city.id);
    persistCityId(city.id);
    return city;
  }, []);

  const removeLocation = useCallback(
    (id) => {
      removeCustomCity(id);
      if (id === cityId) {
        setCityId(DEFAULT_CITY_ID);
        persistCityId(DEFAULT_CITY_ID);
      }
    },
    [cityId]
  );

  // A custom city can be deleted from another tab, so never trust the
  // stored id to still resolve.
  const city = cities.find((c) => c.id === cityId) ?? cities[0];

  return { city, cities, selectCity, addLocation, removeLocation };
}
