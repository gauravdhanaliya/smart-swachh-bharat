// Local development server: `npm run server` (API on http://localhost:4000).
import { startApi } from "./start.js";
import { seedIfEmpty } from "./seed.js";

function fail(message) {
  console.error(`\nEcoSetu API can't start: ${message}\n`);
  process.exit(1);
}

const { config, connection, repo, app } = await startApi().catch((err) => fail(err.message));
const { seeded } = await seedIfEmpty(repo, { demo: config.seedDemoData });

const server = app.listen(config.port, () => {
  console.log(`EcoSetu API listening on http://localhost:${config.port}`);
  console.log(`MongoDB: connected to database "${config.mongoDbName}"${seeded ? " (seeded)" : ""}`);
});

const shutdown = () => {
  server.close(() => connection.close().finally(() => process.exit(0)));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
