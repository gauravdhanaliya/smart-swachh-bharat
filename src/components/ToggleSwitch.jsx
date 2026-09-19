/**
 * On/off switch for the Citizen Profile preference rows.
 *
 * Built on a real <button role="switch"> with aria-checked rather than a
 * styled checkbox so screen readers announce it as a switch and the
 * whole 44px row stays tappable on a phone.
 *
 * The knob uses a literal hex rather than `bg-white`, because the night
 * palette in index.css remaps bg-white to a dark card surface and the
 * knob has to stay light in both themes to read as on/off.
 */
export default function ToggleSwitch({ checked, onChange, label, description, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-3 text-left disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-emerald-950">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-emerald-800/60">{description}</span>
        )}
      </span>

      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? "bg-emerald-600" : "bg-emerald-100"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-[#ffffff] shadow transition ${
            checked ? "translate-x-[22px]" : "translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  );
}
