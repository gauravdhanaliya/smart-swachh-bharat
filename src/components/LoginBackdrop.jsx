import { motion, useReducedMotion } from "motion/react";
import { BLOBS } from "./loginBackdropBlobs";

/**
 * Three soft colour fields drifting slowly behind the login page.
 *   - transform only (x, y, scale), so it runs on the compositor: no layout,
 *     no repaint, no filter. The soft edge is the radial gradient itself, not
 *     a CSS blur, which is expensive on low-end phones.
 *   - colours are the --color-backdrop-* tokens, light enough that the
 *     brand-green text over them stays WCAG AA (src/utils/contrast.test.js)
 *   - with prefers-reduced-motion it is a still picture
 * The fields themselves are in ./loginBackdropBlobs.js.
 * The parent must create a stacking context (`isolate`) and clip (`overflow-hidden`).
 */
export default function LoginBackdrop() {
  const reduced = useReducedMotion();
  return (
    <div aria-hidden="true" data-motion={reduced ? "static" : "ambient"} className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {BLOBS.map((blob) => (
        <motion.div
          key={blob.color}
          className={`absolute rounded-full will-change-transform ${blob.position}`}
          style={{ background: `radial-gradient(closest-side, ${blob.color}, transparent)` }}
          animate={reduced ? undefined : blob.animate}
          transition={reduced ? undefined : { duration: blob.duration, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
