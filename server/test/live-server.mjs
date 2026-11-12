// A real EcoSetu API on an in-memory MongoDB, for the web app's integration
// tests (src/test/liveServer.js starts it as a child process). Photos go to an
// in-memory stand-in for the private Blob store. Prints "READY <base url>",
// and stops cleanly (MongoDB included) when it reads "stop" on stdin — a
// signal can't do that reliably on Windows.

import { seedAll } from "../src/seed.js";
import { startTestServer } from "./helpers.js";

const t = await startTestServer({
  DEMO_LOGIN_ENABLED: "true",
  ECOSETU_DEMO_RATE_MAX: "100000",
  ECOSETU_COMPLAINT_RATE_MAX: "100000",
});
await seedAll(t.repo, { demo: true });
process.stdout.write(`READY ${t.base}\n`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await t.stop().catch(() => {});
  process.exit(0);
};
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  if (chunk.includes("blob-down")) t.photos.failPuts = true;
  if (chunk.includes("blob-up")) t.photos.failPuts = false;
  if (chunk.includes("stop")) stop();
});
process.stdin.on("end", stop); // the test process went away
