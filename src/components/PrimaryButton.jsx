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
      className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-semibold text-white transition-colors hover:bg-brand-hover btn-disabled ${className}`}
    >
      {children}
    </button>
  );
}
