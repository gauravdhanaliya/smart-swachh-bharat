import { useEffect, useState } from "react";
import { getSessionClient } from "../services/session";

/**
 * An <img> for a photo that may be private. Photos from the EcoSetu API
 * ("/api/...photo") can't be plain image links: the request needs the
 * signed-in user's token, and the server checks they may see it. So the photo
 * is fetched with the token and shown from an object URL (released again
 * when the component goes). Data URLs (the browser-only build, or a photo
 * just taken) are shown as they are.
 */
export default function ProtectedImage({ src, alt, className = "" }) {
  const needsAuth = typeof src === "string" && src.startsWith("/api/");
  const [url, setUrl] = useState(needsAuth ? null : src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!needsAuth) {
      setUrl(src);
      return undefined;
    }
    setUrl(null);
    let current = true;
    let objectUrl = null;
    getSessionClient()
      .requestBlob(src)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (current) setUrl(objectUrl);
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, needsAuth]);

  if (!src) return null;
  if (failed) {
    return (
      <p className={`flex items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-500 ${className}`}>
        Photo unavailable
      </p>
    );
  }
  if (!url) {
    return <div role="status" aria-label={`Loading ${alt}`} className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
  }
  return <img src={url} alt={alt} className={className} />;
}
