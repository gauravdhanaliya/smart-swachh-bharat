// Conditional responses for the lists the web app polls.
//
// The app remembers each list's ETag and sends it back as If-None-Match; an
// unchanged list then costs a 304 with no body. Express has this built in,
// but it never fires here: when a page sets If-None-Match itself, fetch (in
// browsers and in Node) also sends "Cache-Control: no-cache", and Express
// treats that as "always send the full response". So the comparison is done
// here, deliberately ignoring that request header.
//
// The ETag is a hash of the exact JSON this user would receive, so it changes
// whenever anything in the list does (a vote, a status, a read notification),
// and one user's ETag never matches another user's list.

import crypto from "node:crypto";

export function sendJsonWithEtag(req, res, body) {
  const json = JSON.stringify(body);
  const etag = `W/"${crypto.createHash("sha256").update(json).digest("base64url").slice(0, 32)}"`;
  res.setHeader("ETag", etag);
  const given = String(req.headers["if-none-match"] ?? "")
    .split(",")
    .map((s) => s.trim());
  if (given.includes(etag) || given.includes(etag.slice(2))) {
    res.status(304).end();
    return;
  }
  res.type("application/json").send(json);
}
