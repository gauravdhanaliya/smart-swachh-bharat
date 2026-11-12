// Helpers shared by the admin scripts (grant-role, seed-demo-roles).

import { loadConfig } from "../src/config.js";
import { connectDatabase, createRepository } from "../src/db.js";

export { normalisePhone } from "../src/phone.js";

/** Full phone numbers are never printed: 98••••••10 */
export function maskPhone(phone) {
  return `${phone.slice(0, 2)}••••••${phone.slice(-2)}`;
}

/** Connects with the same .env settings as the server, runs fn(repo, config, db), always closes. */
export async function withRepo(fn) {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`Can't run: ${err.message}`);
    process.exit(1);
  }
  const conn = await connectDatabase({ uri: config.mongoUri, dbName: config.mongoDbName }).catch((err) => {
    console.error(`Can't run: ${err.message}`);
    process.exit(1);
  });
  try {
    return await fn(createRepository(conn.db, conn.client, null, { phoneHashSecret: config.phoneHashSecret }), config, conn.db);
  } finally {
    await conn.close();
  }
}

export const describeResult = (status) =>
  status === "updated" ? "updated" : "saved as pending — applied at their first sign-in";
