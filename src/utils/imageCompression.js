// Shrinks photos before they leave the device.
//
// The API accepts an image of at most 1 MB (PHOTO_TARGET_BYTES) and Vercel
// refuses request bodies over 4.5 MB, so every photo a citizen or worker
// attaches is scaled to at most PHOTO_MAX_DIMENSION on its longest side and
// re-encoded as JPEG, lowering the quality step by step and, if that is not
// enough, halving the dimensions, until it fits.
//
// The browser parts (decoding a file, drawing to a canvas) are in `browserDeps`
// so the algorithm itself can be tested without a real canvas.

export const PHOTO_TARGET_BYTES = 1_000_000;
export const PHOTO_MAX_DIMENSION = 1600;
const MIN_DIMENSION = 100;
const QUALITIES = [0.85, 0.7, 0.55, 0.4];

/** Decoded size, in bytes, of a base64 data URL. */
export function dataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl) return 0;
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

const browserDeps = {
  /** Decodes a File/Blob, a data URL, or a playing <video>, into something drawImage() accepts. */
  async loadImage(input) {
    if (typeof HTMLVideoElement !== "undefined" && input instanceof HTMLVideoElement) {
      return { source: input, width: input.videoWidth, height: input.videoHeight };
    }
    if (typeof createImageBitmap === "function" && input instanceof Blob) {
      const bitmap = await createImageBitmap(input);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    }
    const url = input instanceof Blob ? URL.createObjectURL(input) : input;
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode failed"));
        el.src = url;
      });
      return { source: img, width: img.naturalWidth, height: img.naturalHeight };
    } finally {
      if (input instanceof Blob) URL.revokeObjectURL(url);
    }
  },
  /** Draws `source` at the given size and returns a JPEG data URL. */
  encode(source, width, height, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(source, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  },
};

/**
 * Returns `{ dataUrl, bytes, width, height }` with `bytes` at or under
 * `maxBytes` whenever that is achievable above MIN_DIMENSION. Rejects with a
 * user-readable message when the input can't be decoded.
 */
export async function compressImage(input, { maxBytes = PHOTO_TARGET_BYTES, maxDimension = PHOTO_MAX_DIMENSION } = {}, deps = browserDeps) {
  let loaded;
  try {
    loaded = await deps.loadImage(input);
  } catch {
    throw new Error("Couldn't read that image. Please try another one.");
  }
  const { source } = loaded;
  if (!(loaded.width > 0 && loaded.height > 0)) throw new Error("Couldn't read that image. Please try another one.");

  const scale = Math.min(1, maxDimension / Math.max(loaded.width, loaded.height));
  let width = Math.max(1, Math.round(loaded.width * scale));
  let height = Math.max(1, Math.round(loaded.height * scale));

  let best = null;
  for (;;) {
    for (const quality of QUALITIES) {
      const dataUrl = deps.encode(source, width, height, quality);
      const result = { dataUrl, bytes: dataUrlBytes(dataUrl), width, height };
      if (result.bytes <= maxBytes) return result;
      if (!best || result.bytes < best.bytes) best = result;
    }
    if (Math.max(width, height) <= MIN_DIMENSION) return best;
    width = Math.max(1, Math.round(width / 2));
    height = Math.max(1, Math.round(height / 2));
  }
}
