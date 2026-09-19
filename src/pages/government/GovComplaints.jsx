import { useMemo, useState } from "react";
import GovShell from "../../components/GovShell";
import GovComplaintsList from "../../components/GovComplaintsList";
import StatusFilterTabs from "../../components/StatusFilterTabs";
import { GovNavIcons } from "../../components/GovNavIcons";
import { useComplaints } from "../../hooks/useComplaints";
import { STATUS } from "../../data/complaints";

export default function GovComplaints() {
  const complaints = useComplaints();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const filterOptions = useMemo(
    () => [
      { value: "all", label: "All", count: complaints.length },
      {
        value: STATUS.SUBMITTED,
        label: "Submitted",
        count: complaints.filter((c) => c.status === STATUS.SUBMITTED).length,
      },
      {
        value: STATUS.ASSIGNED,
        label: "Assigned",
        count: complaints.filter((c) => c.status === STATUS.ASSIGNED).length,
      },
      {
        value: STATUS.IN_PROGRESS,
        label: "In Progress",
        count: complaints.filter((c) => c.status === STATUS.IN_PROGRESS).length,
      },
      {
        value: STATUS.RESOLVED,
        label: "Resolved",
        count: complaints.filter((c) => c.status === STATUS.RESOLVED).length,
      },
    ],
    [complaints]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return complaints.filter((c) => {
      const matchesStatus = filter === "all" || c.status === filter;
      const matchesQuery =
        !q ||
        c.id.toLowerCase().includes(q) ||
        c.location.address.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [complaints, filter, query]);

  return (
    <GovShell title="Complaints" subtitle="Manage citizen complaints across the city">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {GovNavIcons.search}
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by complaint ID or location…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
            />
          </div>
          <StatusFilterTabs options={filterOptions} value={filter} onChange={setFilter} />
        </div>

        <GovComplaintsList
          complaints={filtered}
          emptyMessage="No complaints match your search/filter."
        />
      </div>
    </GovShell>
  );
}
