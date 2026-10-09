import { loadConfig } from "./config.js";
import { openDatabase, createRepository } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { createApp } from "./app.js";

const config = loadConfig();
const db = openDatabase(config.dbPath);
const repo = createRepository(db);
const { seeded } = seedIfEmpty(repo, { demo: config.seedDemoData });

const app = createApp({ config, repo });
app.listen(config.port, () => {
  console.log(`EcoSetu API listening on http://localhost:${config.port}`);
  console.log(`Database: ${config.dbPath}${seeded ? " (seeded)" : ""}`);
  config.warnings.forEach((w) => console.warn(`WARN ${w}`));
});
