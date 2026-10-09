// Import verified locations from a CSV file.
//
//   node server/scripts/import-locations.js path/to/locations.csv [--replace-demo]
//
// CSV header (order doesn't matter, extra columns are ignored):
//   name,type,latitude,longitude,address,description,source_url
//
// `type` is one of: academic_building, department_building, library,
// admin_block, hostel, canteen, main_gate, dustbin, public_toilet.
//
// Rows are validated with the same rules as the API, stored as VERIFIED
// (isDemo = false), and the whole file is rejected if any row is invalid.
// Only import coordinates you have actually checked — for example by
// reading them off OpenStreetMap (© OpenStreetMap contributors, ODbL) or a
// site survey, and recording where in `source_url`.
//
// --replace-demo soft-deletes every DEMO location first, so the simulated
// placeholders stop appearing once real data is in.

import fs from "node:fs";
import { loadConfig } from "../src/config.js";
import { openDatabase, createRepository } from "../src/db.js";
import { seedIfEmpty } from "../src/seed.js";
import { ValidationError, validateLocation } from "../src/validate.js";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  const [header, ...body] = rows;
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export function importRows(repo, rows, { replaceDemo = false, actor = "csv-import" } = {}) {
  const problems = [];
  const parsed = rows.map((r, i) => {
    try {
      const v = validateLocation({
        name: r.name,
        type: r.type,
        latitude: r.latitude,
        longitude: r.longitude,
        address: r.address,
        description: [r.description, r.source_url && `Source: ${r.source_url}`].filter(Boolean).join(" — "),
      });
      return v;
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      problems.push(`Row ${i + 2}: ${Object.values(err.errors).join(" ")}`);
      return null;
    }
  });
  if (problems.length) return { imported: 0, problems };

  repo.transaction(() => {
    if (replaceDemo) {
      for (const l of repo.listLocations()) if (l.isDemo) repo.softDelete(l.id, actor, "Replaced by verified import");
    }
    for (const v of parsed) {
      repo.insertLocation({ ...v, source: "verified", createdBy: actor, isDemo: false });
    }
  });
  return { imported: parsed.length, problems: [] };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("import-locations.js")) {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: node server/scripts/import-locations.js <file.csv> [--replace-demo]");
    process.exit(1);
  }
  const config = loadConfig();
  const repo = createRepository(openDatabase(config.dbPath));
  seedIfEmpty(repo, { demo: config.seedDemoData });
  const { imported, problems } = importRows(repo, parseCsv(fs.readFileSync(file, "utf8")), {
    replaceDemo: flags.includes("--replace-demo"),
  });
  if (problems.length) {
    console.error("Nothing imported. Fix these rows and retry:\n" + problems.map((p) => `  ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`Imported ${imported} verified location(s).`);
}
