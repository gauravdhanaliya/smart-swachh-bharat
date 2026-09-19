export default function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  className = "",
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full inline-flex items-center justify-center gap-2 rounded-full bg-emerald-700 px-6 py-3.5 text-base font-semibold text-white shadow-md shadow-emerald-900/20 transition active:scale-[0.98] hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:shadow-none ${className}`}
    >
      {children}
    </button>
  );
}
