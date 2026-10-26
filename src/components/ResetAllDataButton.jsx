import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "./ConfirmDialog";
import { useAuth } from "../context/AuthContext";

/**
 * "Reset all data" for the Profile pages: after a confirm, wipes every
 * EcoSetu key (complaints, facilities, requests, workers, profiles,
 * session) for every role, logs out and returns to /login.
 */
export default function ResetAllDataButton({ className = "" }) {
  const navigate = useNavigate();
  const { resetAllData } = useAuth();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`w-full rounded-full border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 ${className}`}
      >
        Reset all data
      </button>
      <ConfirmDialog
        open={confirming}
        danger
        title="Reset all data?"
        message="This deletes every complaint, task, facility, facility request, worker and profile on this device, for all three roles, and logs you out. It can't be undone."
        confirmLabel="Yes, reset everything"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          resetAllData();
          navigate("/login", { replace: true });
        }}
      />
    </>
  );
}
