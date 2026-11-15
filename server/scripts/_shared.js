// Helpers shared by the admin scripts (grant-role, migrate, seed, import-locations).

import { loadConfig } from "../src/config.js";
import { connectDatabase, createRepository, describeMongoError } from "../src/db.js";


/** Connects with the same .env settings as the server, runs fn(repo, config, db), always closes. */
export async function withRepo(fn) {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`Can't run: ${err.message}`);
    process.exit(1);
  }
  const conn = await connectDatabase({ uri: config.mongoUri, dbName: config.mongoDbName, trackFailedCommands: true }).catch((err) => {
    console.error(`Can't run: ${err.message}`);
    // Code, codeName and the failing command (e.g. 8000 AtlasError on collMod) — never the URI or credentials.
    console.error(`  Details: ${err.details ?? describeMongoError(err, { uri: config.mongoUri })}`);
    process.exit(1);
  });
  try {
    return await fn(createRepository(conn.db, conn.client, null, { identityHashSecret: config.identityHashSecret }), config, conn.db);
  } catch (err) {
    console.error(`Failed: ${conn.describeError(err)}`);
    process.exitCode = 1;
  } finally {
    await conn.close();
  }
}

export const describeResult = (status) =>
  status === "updated"
    ? "updated"
    : "saved as pending — applied when this account signs in with its email verified (it hasn't yet, or nobody has saved this email)";
