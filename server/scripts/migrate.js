// One-time data migrations for an upgrade. Run once after deploying a new
// version, against the same database the server uses:
//
//   npm run migrate
//
// Not run on connect: on Vercel several instances can cold-start at the same
// moment, and a migration must not run concurrently from each of them. It is
// still safe to run twice (or two copies at once): a second run finds nothing
// left to change and says so.
//
// Current migrations:
//   - users: plain phone number -> keyed hash + masked copy (PHONE_HASH_SECRET)
//   - pending roles and facility-request owners re-keyed off the phone number
//   - the old unique index on users.phone dropped
//   - bins: fill percentage -> categorical status
//   - photos: base64 inside documents -> the private Vercel Blob store
//     (needs BLOB_READ_WRITE_TOKEN; without it the script stops and says so)

import { countLegacyPhotos, migrateLegacyBins, migrateLegacyPhotos, migrateLegacyUsers } from "../src/db.js";
import { createPhotoStore } from "../src/photoStore.js";
import { withRepo } from "./_shared.js";

await withRepo(async (repo, config, db) => {
  console.log(`Migrating database "${config.mongoDbName}"`);
  const users = await migrateLegacyUsers(db, config.phoneHashSecret);
  const bins = await migrateLegacyBins(db);

  const waiting = await countLegacyPhotos(db);
  const store = createPhotoStore(config.photoStorage);
  let photos = 0;
  if (waiting && !store) {
    console.error(
      `${waiting} photos are still stored in MongoDB. Connect a private Vercel Blob store ` +
        "(set BLOB_READ_WRITE_TOKEN) and run npm run migrate again to move them."
    );
    process.exitCode = 1;
  } else if (waiting) {
    photos = await migrateLegacyPhotos(db, store);
  }

  const lines = [
    [`users: ${users.users} converted to a phone hash`, users.users],
    [`facility request owners: ${users.requests} re-keyed from phone to uid`, users.requests],
    [`pending roles: ${users.pendingRoles} re-keyed to the phone hash`, users.pendingRoles],
    [`old phone index: dropped`, users.indexDropped ? 1 : 0],
    [`bins: ${bins} converted from a fill percentage to a status`, bins],
    [`photos: ${photos} moved to private Blob storage`, photos],
  ].filter(([, n]) => n > 0);

  if (!lines.length && !process.exitCode) console.log("Nothing to change: the database is already up to date.");
  for (const [line] of lines) console.log(`  ${line}`);
});
