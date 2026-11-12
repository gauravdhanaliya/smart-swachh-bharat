// Uploading, serving and deleting photos for the routes.
//
//   upload(dataUrl, folder)  after the route's auth and validation (type, 1 MB)
//                            -> blob pathname, or null when there is no photo.
//                            503 when no store is configured, 502 when the
//                            store refuses; nothing is saved in either case.
//   tryUpload(dataUrl, folder) -> { pathname, photoSaved } — the same, but a
//                            store that can't take it (not configured, over
//                            its limit, down) gives { pathname: null,
//                            photoSaved: false } instead of failing, so the
//                            report is still filed without the photo.
//   discard(pathnames)       deletes blobs. A failure is logged and queued for
//                            the daily retry (blob_deletions), never thrown:
//                            the user's request still succeeds.
//   send(res, ref)           streams a photo the route has already authorised.
//                            ref is { pathname } or { legacy } (a base64 photo
//                            from an older build, until npm run migrate runs).

import { decodePhoto, newPhotoPathname } from "./photoStore.js";

import { PHOTO_NOT_SAVED } from "./constants.js";
export { PHOTO_NOT_SAVED };

/** Adds { photoSaved: false, warning } to a reply when a photo was sent but couldn't be kept. */
export const photoNote = (photoSaved, warning = PHOTO_NOT_SAVED) => (photoSaved === false ? { photoSaved: false, warning } : {});

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.httpStatus = status;
  }
}

function photoHeaders(res, contentType) {
  res.setHeader("Content-Type", contentType);
  // Personal images: never stored by a browser cache or a CDN.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", "inline");
}

export function createPhotoService({ photoStore, repo }) {
  return {
    async upload(dataUrl, folder) {
      if (!dataUrl) return null;
      if (!photoStore) {
        throw new HttpError(503, "Photo uploads are not available right now. Send the report without a photo, or try again later.");
      }
      const { buffer, contentType, ext } = decodePhoto(dataUrl);
      const pathname = newPhotoPathname(folder, ext);
      try {
        await photoStore.put(pathname, buffer, contentType);
      } catch (err) {
        console.error("[photos] upload failed:", err?.message ?? err);
        throw new HttpError(502, "The photo couldn't be saved. Please try again.");
      }
      return pathname;
    },

    async tryUpload(dataUrl, folder) {
      if (!dataUrl) return { pathname: null, photoSaved: null };
      try {
        return { pathname: await this.upload(dataUrl, folder), photoSaved: true };
      } catch (err) {
        if (err?.httpStatus === 502 || err?.httpStatus === 503) return { pathname: null, photoSaved: false };
        throw err;
      }
    },

    async discard(pathnames) {
      const list = pathnames.filter(Boolean);
      if (!list.length) return;
      try {
        if (!photoStore) throw new Error("No photo store configured.");
        await photoStore.del(list);
      } catch (err) {
        console.error(`[photos] deleting ${list.length} blob(s) failed; queued for retry:`, err?.message ?? err);
        await repo.queueBlobDeletions(list, err?.message ?? String(err));
      }
    },

    async send(res, ref) {
      if (ref?.legacy) {
        const { buffer, contentType } = decodePhoto(ref.legacy);
        photoHeaders(res, contentType);
        res.end(buffer);
        return true;
      }
      if (!ref?.pathname || !photoStore) return false;
      const file = await photoStore.get(ref.pathname);
      if (!file) return false;
      photoHeaders(res, file.contentType ?? "application/octet-stream");
      if (file.size) res.setHeader("Content-Length", String(file.size));
      await new Promise((resolve, reject) => {
        file.stream.on("error", reject);
        res.on("finish", resolve);
        res.on("close", resolve);
        file.stream.pipe(res);
      });
      return true;
    },
  };
}
