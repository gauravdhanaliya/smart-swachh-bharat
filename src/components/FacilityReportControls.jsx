import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReportFacilitySheet from "./ReportFacilitySheet";
import { useOpenComplaintCount } from "../hooks/useOpenComplaintCount";

const openLabel = (n) => (n === 0 ? "No open reports" : `${n} open report${n === 1 ? "" : "s"}`);

/** "3 open reports" for a bin or toilet's details page. */
export function OpenReportsNote({ facilityId }) {
  const count = useOpenComplaintCount(facilityId);
  if (count == null) return null;
  return (
    <p className="mt-2 flex items-center gap-2 text-sm text-emerald-800/70">
      <span className={`h-2 w-2 shrink-0 rounded-full ${count ? "bg-amber-500" : "bg-emerald-400"}`} aria-hidden="true" />
      {openLabel(count)}
    </p>
  );
}

/**
 * The details page's "Report an issue" sheet. It also opens straight away
 * when the page is opened with ?report=1 (the map popups link there).
 */
export function useReportSheet() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(() => params.get("report") === "1");
  const close = useCallback(() => {
    setOpen(false);
    if (params.get("report")) {
      const next = new URLSearchParams(params);
      next.delete("report");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);
  return { open, show: () => setOpen(true), close };
}

export { ReportFacilitySheet };
