// Where complaint and facility-request photos are kept.
//
// Production: a PRIVATE Vercel Blob store. Its URLs don't work without a
// token, so photos can only be read through this server, which checks who is
// asking (see routes-civic.js). MongoDB holds only the blob pathname.
//
// Every store has the same four methods:
//   put(pathname, buffer, contentType, { overwrite }) -> { pathname }
//   get(pathname)  -> { stream (Node Readable), contentType, size } | null
//   del(pathnames) -> void; throws if the store can't be reached
//   kind           -> "vercel-blob" | "memory" | "folder"
// The memory and folder stores are for tests only (the folder one lets a
// separate process, like npm run migrate, share a fake store with a test).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT).map(([type, ext]) => [ext, type]));

/** A validated data URL ("data:image/jpeg;base64,...") -> { buffer, contentType, ext }. */
export function decodePhoto(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Not an image data URL.");
  return { buffer: Buffer.from(match[2], "base64"), contentType: match[1], ext: EXT[match[1]] };
}

/** A fresh, unguessable pathname for a new upload, e.g. "complaints/<uuid>.jpg". */
export function newPhotoPathname(folder, ext) {
  return `${folder}/${crypto.randomUUID()}.${ext}`;
}

/** A stable pathname for a migrated photo, so re-running the migration overwrites rather than duplicates. */
export function migratedPhotoPathname(folder, recordId, buffer, ext) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  return `${folder}/${recordId}-${hash}.${ext}`;
}

// Pathnames are generated here; anything else is refused before touching a store.
const SAFE_PATHNAME = /^(complaints|resolutions|facility-requests)\/[A-Za-z0-9-]+\.(jpg|png|webp)$/;
export const isPhotoPathname = (p) => typeof p === "string" && SAFE_PATHNAME.test(p);

function assertPathname(p) {
  if (!isPhotoPathname(p)) throw new Error("Invalid photo pathname.");
}

// ---- Vercel Blob (private) ---------------------------------------------

export function createVercelBlobPhotoStore({ token } = {}) {
  // Loaded on first use, so tests and the browser-only build never need it.
  const sdk = () => import("@vercel/blob");
  const auth = token ? { token } : {}; // otherwise the SDK uses the Vercel OIDC credentials
  return {
    kind: "vercel-blob",
    async put(pathname, buffer, contentType, { overwrite = false } = {}) {
      assertPathname(pathname);
      const { put } = await sdk();
      await put(pathname, buffer, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: overwrite, ...auth });
      return { pathname };
    },
    async get(pathname) {
      assertPathname(pathname);
      const { get } = await sdk();
      const result = await get(pathname, { access: "private", ...auth });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return {
        stream: Readable.fromWeb(result.stream),
        contentType: result.blob?.contentType ?? TYPE_BY_EXT[pathname.split(".").pop()],
        size: result.blob?.size ?? null,
      };
    },
    async del(pathnames) {
      const list = [pathnames].flat();
      if (!list.length) return;
      list.forEach(assertPathname);
      const { del } = await sdk();
      await del(list, auth);
    },
  };
}

// ---- test stores ------------------------------------------------------------

/** In-memory store. `failPuts` / `failDeletes` simulate an outage. */
export function createMemoryPhotoStore() {
  const files = new Map();
  const store = {
    kind: "memory",
    failPuts: false,
    failDeletes: false,
    lastPut: null,
    async put(pathname, buffer, contentType, { overwrite = false } = {}) {
      assertPathname(pathname);
      if (store.failPuts) throw new Error("Blob store unavailable (simulated).");
      if (files.has(pathname) && !overwrite) throw new Error("This blob already exists.");
      files.set(pathname, { bytes: Buffer.from(buffer), contentType });
      store.lastPut = { pathname, access: "private" };
      return { pathname };
    },
    async get(pathname) {
      assertPathname(pathname);
      const f = files.get(pathname);
      return f ? { stream: Readable.from([f.bytes]), contentType: f.contentType, size: f.bytes.length } : null;
    },
    async del(pathnames) {
      if (store.failDeletes) throw new Error("Blob store unavailable (simulated).");
      for (const p of [pathnames].flat()) files.delete(p);
    },
    count: () => files.size,
    has: (p) => files.has(p),
    read: (p) => files.get(p) ?? null,
  };
  return store;
}

/** A store in a local folder. Tests only: lets a child process share it. */
export function createFolderPhotoStore(dir) {
  const file = (p) => path.join(dir, ...p.split("/"));
  return {
    kind: "folder",
    async put(pathname, buffer, contentType) {
      assertPathname(pathname);
      fs.mkdirSync(path.dirname(file(pathname)), { recursive: true });
      fs.writeFileSync(file(pathname), buffer);
      return { pathname, contentType };
    },
    async get(pathname) {
      assertPathname(pathname);
      if (!fs.existsSync(file(pathname))) return null;
      const bytes = fs.readFileSync(file(pathname));
      return { stream: Readable.from([bytes]), contentType: TYPE_BY_EXT[pathname.split(".").pop()], size: bytes.length };
    },
    async del(pathnames) {
      for (const p of [pathnames].flat()) fs.rmSync(file(p), { force: true });
    },
  };
}

/** The store `config.photoStorage` describes, or null when photos aren't configured. */
export function createPhotoStore(photoStorage) {
  if (photoStorage.kind === "folder") return createFolderPhotoStore(photoStorage.dir);
  if (photoStorage.kind === "vercel-blob") return createVercelBlobPhotoStore({ token: photoStorage.token });
  return null;
}
