import { loadConfig } from "./config.js";
import { connectDatabase, createRepository } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { createApp } from "./app.js";
import { createFirebaseVerifier } from "./firebase.js";

function fail(message) {
  console.error(`\nEcoSetu API can't start: ${message}\n`);
  process.exit(1);
}

let config;
try {
  config = loadConfig();
} catch (err) {
  fail(err.message);
}

// One shared connection for the whole process; fail fast if it can't be made.
const connection = await connectDatabase({ uri: config.mongoUri, dbName: config.mongoDbName }).catch((err) =>
  fail(err.message)
);
const repo = createRepository(connection.db, connection.client);
const { seeded } = await seedIfEmpty(repo, { demo: config.seedDemoData });

const verifyFirebase = createFirebaseVerifier(config.firebaseProjectId);
const app = createApp({ config, repo, verifyFirebase });
const server = app.listen(config.port, () => {
  console.log(`EcoSetu API listening on http://localhost:${config.port}`);
  console.log(`MongoDB: connected to database "${config.mongoDbName}"${seeded ? " (seeded)" : ""}`);
  config.warnings.forEach((w) => console.warn(`WARN ${w}`));
});

const shutdown = () => {
  server.close(() => connection.close().finally(() => process.exit(0)));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
