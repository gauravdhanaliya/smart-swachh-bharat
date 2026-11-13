// The colour fields behind the login page (src/components/LoginBackdrop.jsx).
// Kept in their own file so the component file exports only a component
// (fast refresh), and so tests can check them directly:
//   - `animate` holds transforms only (x, y, scale): compositor work, no layout
//   - `color` is a --color-backdrop-* token, checked for AA text contrast
//   - `duration` is slow (seconds per drift), so it never draws the eye
export const BLOBS = [
  {
    color: "var(--color-backdrop-green)",
    position: "-top-[18%] -left-[30%] h-[70%] w-[120%]",
    animate: { x: ["0%", "14%"], y: ["0%", "7%"], scale: [1, 1.12] },
    duration: 22,
  },
  {
    color: "var(--color-backdrop-sky)",
    position: "top-[22%] -right-[45%] h-[60%] w-[110%]",
    animate: { x: ["0%", "-16%"], y: ["0%", "-8%"], scale: [1.06, 0.94] },
    duration: 27,
  },
  {
    color: "var(--color-backdrop-amber)",
    position: "-bottom-[22%] -left-[25%] h-[50%] w-[95%]",
    animate: { x: ["0%", "12%"], y: ["0%", "-6%"], scale: [0.94, 1.08] },
    duration: 33,
  },
];
