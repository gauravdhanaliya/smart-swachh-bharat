import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import WorkerShell from "../../components/WorkerShell";
import StatusBadge from "../../components/StatusBadge";
import PriorityBadge from "../../components/PriorityBadge";
import ComplaintTimeline from "../../components/ComplaintTimeline";
import { useComplaint } from "../../hooks/useComplaints";
import { updateComplaintStatus } from "../../services/complaintService";
import {
  STATUS,
  ALLOWED_PHOTO_TYPES,
  MAX_RESOLUTION_PHOTO_SIZE_BYTES,
  RESOLUTION_NOTE_MAX_LENGTH,
  RESOLUTION_NOTE_MIN_LENGTH,
} from "../../data/complaints";

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WorkerTaskDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const complaint = useComplaint(id);
  const fileInputRef = useRef(null);

  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [photo, setPhoto] = useState(null); // { dataUrl, name }
  const [photoError, setPhotoError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!complaint) {
    return (
      <WorkerShell title="Task Details" showBack onBack={() => navigate("/worker/tasks")}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <p className="font-semibold text-slate-900">Task not found</p>
          <p className="text-sm text-slate-500">It may have been removed from the demo data set.</p>
        </div>
      </WorkerShell>
    );
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError("");

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Please upload a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_RESOLUTION_PHOTO_SIZE_BYTES) {
      setPhotoError("Image is too large. Max size is 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPhoto({ dataUrl: reader.result, name: file.name });
    reader.onerror = () => setPhotoError("Couldn't read that image. Please try another one.");
    reader.readAsDataURL(file);
  };

  const handleStartWork = () => {
    setBusy(true);
    try {
      updateComplaintStatus(complaint.id, STATUS.IN_PROGRESS, {
        startedAt: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleMarkResolved = () => {
    const trimmed = note.trim();
    if (trimmed && trimmed.length < RESOLUTION_NOTE_MIN_LENGTH) {
      setNoteError(`Add a little more detail (at least ${RESOLUTION_NOTE_MIN_LENGTH} characters), or leave it blank.`);
      return;
    }
    setNoteError("");
    setBusy(true);
    try {
      updateComplaintStatus(complaint.id, STATUS.RESOLVED, {
        resolvedAt: new Date().toISOString(),
        resolutionNote: trimmed,
        resolutionPhoto: photo?.dataUrl ?? null,
      });
    } finally {
      setBusy(false);
    }
  };

  const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${complaint.location.latitude},${complaint.location.longitude}`;

  return (
    <WorkerShell title="Task Details" showBack onBack={() => navigate("/worker/tasks")}>
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500">#{complaint.id}</p>
              <p className="text-lg font-bold text-slate-900">{complaint.issueType}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <PriorityBadge priority={complaint.priority} />
              <StatusBadge status={complaint.status} />
            </div>
          </div>

          {complaint.photo && (
            <img
              src={complaint.photo}
              alt="Reported issue"
              className="mt-3 h-40 w-full rounded-xl object-cover"
            />
          )}

          <p className="mt-3 text-sm text-slate-700">{complaint.description}</p>

          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-50 pt-3">
            <div>
              <dt className="text-[11px] font-medium text-slate-400">Reported</dt>
              <dd className="text-sm text-slate-800">{formatDateTime(complaint.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-400">Assigned Worker</dt>
              <dd className="text-sm text-slate-800">{complaint.assignedWorkerName ?? "—"}</dd>
            </div>
          </dl>

          <div className="mt-3 border-t border-slate-50 pt-3">
            <p className="text-[11px] font-medium text-slate-400">Location</p>
            <p className="text-sm text-slate-800">{complaint.location.address}</p>
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l19-9-9 19-2-8-8-2z" />
              </svg>
              Navigate
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-bold text-slate-900">Status Timeline</p>
          <ComplaintTimeline status={complaint.status} />
        </div>

        {complaint.status === STATUS.ASSIGNED && (
          <button
            type="button"
            onClick={handleStartWork}
            disabled={busy}
            className="w-full rounded-full bg-orange-600 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-orange-900/10 transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Starting…" : "Start Work"}
          </button>
        )}

        {complaint.status === STATUS.IN_PROGRESS && (
          <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
            <label htmlFor="resolutionNote" className="mb-1.5 block text-sm font-semibold text-slate-900">
              Resolution Note (Optional)
            </label>
            <textarea
              id="resolutionNote"
              rows={3}
              maxLength={RESOLUTION_NOTE_MAX_LENGTH}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (noteError) setNoteError("");
              }}
              placeholder="What did you do to resolve this?"
              className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between">
              {noteError ? (
                <p className="text-xs font-medium text-red-600">{noteError}</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-slate-400">
                {note.length}/{RESOLUTION_NOTE_MAX_LENGTH}
              </p>
            </div>

            <label className="mb-1.5 mt-3 block text-sm font-semibold text-slate-900">
              Completion Photo (Optional)
            </label>
            <div className="flex items-center gap-3">
              {photo ? (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                  <img src={photo.dataUrl} alt="Completed work" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    aria-label="Remove photo"
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-orange-200 text-orange-600 hover:bg-orange-50"
                  aria-label="Add photo"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_PHOTO_TYPES.join(",")}
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>
            {photoError && <p className="mt-1.5 text-xs font-medium text-red-600">{photoError}</p>}

            <button
              type="button"
              onClick={handleMarkResolved}
              disabled={busy}
              className="mt-4 w-full rounded-full bg-orange-600 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-orange-900/10 transition active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Mark as Resolved"}
            </button>
          </div>
        )}

        {complaint.status === STATUS.RESOLVED && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-900">
            <p className="text-sm font-semibold">This task is resolved.</p>
            {complaint.resolutionNote && (
              <p className="mt-1 text-sm text-emerald-800/80">{complaint.resolutionNote}</p>
            )}
            {complaint.resolutionPhoto && (
              <img
                src={complaint.resolutionPhoto}
                alt="Completion"
                className="mt-2 h-32 w-full rounded-xl object-cover"
              />
            )}
            {complaint.resolvedAt && (
              <p className="mt-2 text-xs text-emerald-800/60">
                Resolved {formatDateTime(complaint.resolvedAt)}
              </p>
            )}
          </div>
        )}
      </div>
    </WorkerShell>
  );
}
