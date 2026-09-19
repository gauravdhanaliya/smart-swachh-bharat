import { getTimelineSteps } from "../data/complaints";

const DOT_STYLES = {
  done: "border-emerald-600 bg-emerald-600 text-white",
  current: "border-sky-500 bg-white text-sky-500",
  pending: "border-emerald-100 bg-white text-emerald-200",
};

function StepDot({ state }) {
  if (state === "done") {
    return (
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${DOT_STYLES.done}`}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${DOT_STYLES[state]}`}>
      <span className={`h-2 w-2 rounded-full ${state === "current" ? "bg-sky-500" : "bg-emerald-100"}`} />
    </span>
  );
}

/** Timeline used on the citizen Complaint Tracking screen. Updates live
 * as Government/Worker change the complaint's status. */
export default function ComplaintTimeline({ status, timestamps = {} }) {
  const steps = getTimelineSteps(status);

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => (
        <div key={step.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <StepDot state={step.state} />
            {i < steps.length - 1 && (
              <span
                className={`w-0.5 flex-1 min-h-[20px] ${
                  step.state === "done" ? "bg-emerald-600" : "bg-emerald-100"
                }`}
              />
            )}
          </div>
          <div className={`pb-5 ${step.state === "pending" ? "opacity-50" : ""}`}>
            <p
              className={`text-sm font-semibold ${
                step.state === "pending" ? "text-emerald-800/60" : "text-emerald-950"
              }`}
            >
              {step.label}
            </p>
            {timestamps[step.key] && (
              <p className="text-xs text-emerald-800/50">{timestamps[step.key]}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
