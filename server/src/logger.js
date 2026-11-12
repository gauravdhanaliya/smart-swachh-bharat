// Request and error logging that never records secrets or personal data.
//
// What is logged is chosen, not filtered: for a request only the method, the
// path WITHOUT its query string, the status, the time taken, the user's role
// and a request id — never headers, cookies, bodies or query strings. For an
// unexpected error only its name and message. Then every line also goes
// through redact(), a second line of defence in case a path or an error
// message happens to contain a token, a phone number or image data.

import crypto from "node:crypto";

const RULES = [
  [/Bearer\s+[^\s"',;]+/gi, "Bearer [redacted]"],
  [/eyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*){1,2}/g, "[jwt]"],
  [/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]*/gi, "[data-url]"],
  [/vercel_blob_rw_[A-Za-z0-9_]+/g, "[blob-token]"],
  [/(ssb_refresh=)[^;\s"]+/g, "$1[redacted]"],
  [/-?\b\d{1,3}\.\d{4,}\b/g, "[coord]"], // latitudes / longitudes (4+ decimals: a place someone was)
  [/(?:\+?91[\s-]?)?(?<![\dA-Za-z])\d[\d\s-]{8,}\d(?![\dA-Za-z])/g, "[number]"], // phone numbers and other long numbers
];

/** Removes anything that looks like a token, cookie value, phone number or image data. */
export function redact(text) {
  return RULES.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), String(text));
}

/** A logger writing one JSON line per event to `sink` (console.log by default). */
export function createLogger(sink = (line) => console.log(line)) {
  const write = (level, fields) => {
    try {
      sink(redact(JSON.stringify({ t: new Date().toISOString(), level, ...fields })));
    } catch {
      // logging must never break a request
    }
  };
  return { info: (fields) => write("info", fields), error: (fields) => write("error", fields) };
}

/** Express middleware: one line per request, written when the response finishes. */
export function requestLogger(logger) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    req.id = crypto.randomBytes(4).toString("hex");
    res.on("finish", () => {
      logger.info({
        id: req.id,
        method: req.method,
        path: req.path, // no query string
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - start) / 1_000_000n),
        role: req.user?.role ?? null,
      });
    });
    next();
  };
}
