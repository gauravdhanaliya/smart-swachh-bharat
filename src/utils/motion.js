// Shared motion tokens for Motion (motion.dev). Every animated screen uses
// these, so timing and easing feel the same everywhere.
//
// Each preset takes `reduced` (from Motion's useReducedMotion()): with
// prefers-reduced-motion the element only fades, quickly; nothing slides or
// scales. The app root also sets <MotionConfig reducedMotion="user">, which
// drops transform animations for those users as a second line.

export const EASE_OUT = [0.22, 1, 0.36, 1];
const ENTER = 0.24;
const EXIT = 0.16; // exits are about two thirds of entrances
const FADE = { enter: 0.12, exit: 0.08 };

const fadeOnly = () => ({
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: FADE.enter } },
  exit: { opacity: 0, transition: { duration: FADE.exit } },
});

/** Messages, cards and inline panels appearing. */
export function fadeUp(reduced) {
  if (reduced) return fadeOnly();
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: ENTER, ease: EASE_OUT } },
    exit: { opacity: 0, y: 4, transition: { duration: EXIT } },
  };
}

/** Bottom sheets: rise from the bottom edge (where they are opened from). */
export function sheet(reduced) {
  if (reduced) return fadeOnly();
  return {
    initial: { opacity: 1, y: "100%" },
    animate: { opacity: 1, y: 0, transition: { type: "spring", damping: 32, stiffness: 320, mass: 0.9 } },
    exit: { opacity: 1, y: "100%", transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } },
  };
}

/** The dimmed layer behind a sheet or dialog. */
export function backdrop(reduced) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: reduced ? FADE.enter : 0.2 } },
    exit: { opacity: 0, transition: { duration: reduced ? FADE.exit : EXIT } },
  };
}

/** Steps of a multi-step flow: forward slides in from the right, back from the left. */
export function step(reduced, direction = 1) {
  if (reduced) return fadeOnly();
  return {
    initial: { opacity: 0, x: 24 * direction },
    animate: { opacity: 1, x: 0, transition: { duration: ENTER, ease: EASE_OUT } },
    exit: { opacity: 0, x: -16 * direction, transition: { duration: EXIT } },
  };
}
