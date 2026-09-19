import { useEffect, useRef, useState } from "react";

/**
 * Live-camera-only photo capture. Deliberately has no <input type="file">
 * anywhere in it — there is no path to a gallery/album picker, only
 * getUserMedia straight to a live video stream, captured to a canvas.
 * This is what ReportIssue.jsx uses instead of a file upload, so a
 * citizen can only submit a photo taken of the issue right now.
 *
 * Controlled from outside: `photo` is the captured { dataUrl } (or null),
 * `onCapture(dataUrl)` fires when a frame is captured, `onRetake()` clears
 * it. The component owns the camera stream/permission/error state itself
 * and always stops the stream on capture, cancel, or unmount.
 */
export default function LiveCameraCapture({ photo, onCapture, onRetake }) {
  const [streaming, setStreaming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Never leave the camera running — stop it whenever this unmounts,
  // e.g. the citizen navigates away mid-capture.
  useEffect(() => stopStream, []);

  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [streaming]);

  const startCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "This browser can't access the camera here (it needs an HTTPS page). Try a different browser."
      );
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setStreaming(true);
    } catch (err) {
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setError("Camera access was denied. Allow camera permission, then try again.");
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        setError("No camera was found on this device.");
      } else {
        setError("Couldn't open the camera. Please try again.");
      }
    } finally {
      setStarting(false);
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopStream();
    setStreaming(false);
    onCapture(dataUrl);
  };

  const cancel = () => {
    stopStream();
    setStreaming(false);
  };

  if (photo) {
    return (
      <div className="relative w-full max-w-[220px] overflow-hidden rounded-2xl border border-emerald-100">
        <img src={photo.dataUrl} alt="Captured issue" className="aspect-square w-full object-cover" />
        <button
          type="button"
          onClick={() => {
            setError("");
            onRetake();
          }}
          aria-label="Retake photo"
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    );
  }

  if (streaming) {
    return (
      <div className="w-full max-w-[220px]">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-emerald-100 bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={cancel}
            className="flex-1 rounded-full border border-emerald-200 py-2 text-xs font-semibold text-emerald-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={capture}
            className="flex-1 rounded-full bg-emerald-700 py-2 text-xs font-semibold text-white"
          >
            Capture
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[220px]">
      <button
        type="button"
        onClick={startCamera}
        disabled={starting}
        className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-60"
        aria-label="Take a photo"
      >
        <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span className="text-xs font-semibold">{starting ? "Opening camera…" : "Take a Picture"}</span>
      </button>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
