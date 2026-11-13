// Ids for complaints ("SSB2027-0001") and facility requests ("FR-2027-001")
// carry the year they were created in. Shared by the server and the
// browser-only build (src/services/api.js, complaintService.js).
//
// The year is India's (IST, UTC+5:30, no daylight saving): a report filed at
// 00:30 on 1 January in India belongs to the new year even though it is still
// 31 December in UTC. Each year's prefix numbers from 1 on its own; ids
// already issued are never renamed.

const IST_OFFSET_MS = 330 * 60 * 1000;

/** The year in India at `at` (a Date, ISO string or epoch ms; default now). */
export function idYear(at = Date.now()) {
  const ms = at instanceof Date ? at.getTime() : typeof at === "string" ? Date.parse(at) : at;
  if (!Number.isFinite(ms)) throw new TypeError(`Not a valid time: ${at}`);
  return new Date(ms + IST_OFFSET_MS).getUTCFullYear();
}

/** "SSB<year>-" for a complaint created at `at`. */
export const complaintIdPrefix = (at) => `SSB${idYear(at)}-`;

/** "FR-<year>-" for a facility request created at `at`. */
export const requestIdPrefix = (at) => `FR-${idYear(at)}-`;
