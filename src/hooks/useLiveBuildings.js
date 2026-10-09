import { useEffect, useState } from "react";
import { getAllBuildings, subscribe as subscribeFacilities } from "../services/facilityService";

// Campus buildings (academic blocks, library, hostels, gates …) from the
// shared API store. Updates whenever the store refreshes.
export function useLiveBuildings() {
  const [buildings, setBuildings] = useState(() => getAllBuildings());

  useEffect(() => {
    setBuildings(getAllBuildings());
    return subscribeFacilities(() => setBuildings(getAllBuildings()));
  }, []);

  return buildings;
}
