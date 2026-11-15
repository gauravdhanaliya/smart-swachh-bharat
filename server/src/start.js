// Everything needed to turn environment variables into a running API app.
// Shared by the local server (index.js) and the Vercel function (api/index.js).

import { loadConfig } from "./config.js";
import { connectDatabase, createRepository } from "./db.js";
import { createApp } from "./app.js";
import { createFirebaseVerifier } from "./firebase.js";
import { createPhotoStore } from "./photoStore.js";

export async function startApi(env = process.env) {
  const config = loadConfig(env);
  const connection = await connectDatabase({
    uri: config.mongoUri,
    dbName: config.mongoDbName,
    maxPoolSize: config.behindVercel ? 5 : 10,
  });
  const repo = createRepository(connection.db, connection.client, null, { identityHashSecret: config.identityHashSecret });
  const photoStore = createPhotoStore(config.photoStorage);
  const app = createApp({ config, repo, photoStore, verifyFirebase: createFirebaseVerifier(config.firebaseProjectId) }); // logs to stdout (Vercel's log view)
  config.warnings.forEach((w) => console.warn(`WARN ${w}`));
  return { config, connection, repo, app };
}
