import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import RatingStars, { StarIcon } from "./RatingStars";
import { useToiletRatings } from "../hooks/useToiletRatings";
import { COMMENT_MAX_LENGTH, RATING_LABELS, formatAverage, ratingCountLabel } from "../utils/ratings";
import { fadeUp } from "../utils/motion";

const STAR_WORDS = { 1: "Very poor", 2: "Poor", 3: "Okay", 4: "Good", 5: "Excellent" };
const CARD = "rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm";
const shortDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Ratings for one public toilet: the average, the count, per-category
 * averages and the latest comments for everyone; the rating form only when
 * `canRate` (citizens). Comments are always rendered as plain text.
 */
export default function ToiletRatingPanel({ toiletId, canRate }) {
  const { summary, recent, mine, status, error, reload, save } = useToiletRatings(toiletId, { withMine: canRate });
  const headingId = useId();
  const comments = recent.filter((r) => r.comment).slice(0, 5);
  const categories = Object.entries(summary?.categories ?? {});

  return (
    <>
      <section aria-labelledby={headingId} className={`mt-4 ${CARD}`}>
        <h2 id={headingId} className="text-sm font-semibold text-emerald-950">
          Ratings
        </h2>

        {!summary && status === "loading" && <p className="mt-3 text-sm text-emerald-800/60">Loading ratings…</p>}
        {!summary && status === "error" && (
          <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            <span>{error?.message || "Ratings couldn't be loaded."}</span>
            <button type="button" onClick={reload} className="min-h-9 rounded-full bg-white px-3 font-semibold shadow-sm">
              Retry
            </button>
          </div>
        )}

        {summary && (
          <div className="mt-3 flex items-center gap-4">
            <p className="text-4xl leading-none font-bold tabular-nums text-emerald-950">{formatAverage(summary.average)}</p>
            <div>
              <RatingStars value={summary.average} className="h-5 w-5" />
              <p className="mt-1 text-xs text-emerald-800/70">{ratingCountLabel(summary.count)}</p>
            </div>
          </div>
        )}

        {categories.length > 0 && (
          <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-emerald-50 pt-4">
            {categories.map(([key, c]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-sm">
                <dt className="text-emerald-900">{RATING_LABELS[key] ?? key}</dt>
                <dd className="flex items-center gap-2">
                  <RatingStars value={c.average} className="h-3.5 w-3.5" />
                  <span className="w-8 text-right font-semibold tabular-nums text-emerald-950">{formatAverage(c.average)}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}

        {comments.length > 0 && (
          <div className="mt-4 border-t border-emerald-50 pt-4">
            <h3 className="text-xs font-semibold tracking-wide text-emerald-800/70 uppercase">Recent comments</h3>
            <ul className="mt-2 flex flex-col gap-3">
              {comments.map((r, i) => (
                <li key={`${r.updatedAt}-${i}`} className="rounded-xl bg-emerald-50/60 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <RatingStars value={r.stars} className="h-3.5 w-3.5" />
                      <span className="sr-only">{`${r.stars} out of 5`}</span>
                    </span>
                    <span className="text-[11px] text-emerald-800/60">{shortDate(r.updatedAt)}</span>
                  </div>
                  {/* Plain text only: React escapes it; never dangerouslySetInnerHTML. */}
                  <p className="mt-1 text-sm text-emerald-950 [overflow-wrap:anywhere]">{r.comment}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {canRate && status !== "loading" && <ToiletRatingForm mine={mine} onSave={save} />}
    </>
  );
}

function ToiletRatingForm({ mine, onSave }) {
  const reduced = useReducedMotion();
  const ids = useId();
  const firstStar = useRef(null);
  const [stars, setStars] = useState(mine?.stars ?? 0);
  const [categories, setCategories] = useState(mine?.categories ?? {});
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [showDetails, setShowDetails] = useState(Object.keys(mine?.categories ?? {}).length > 0);
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState("idle"); // idle | saving | saved
  const [saved, setSaved] = useState(Boolean(mine));

  const title = saved ? "Update your rating" : "Rate this toilet";
  const touched = () => phase === "saved" && setPhase("idle");

  const submit = async (e) => {
    e.preventDefault();
    if (!stars) {
      setErrors({ stars: "Choose 1 to 5 stars." });
      firstStar.current?.focus();
      return;
    }
    setErrors({});
    setPhase("saving");
    try {
      await onSave({ stars, categories, comment: comment.trim() });
      setSaved(true);
      setPhase("saved");
    } catch (err) {
      setErrors(err?.fields && Object.keys(err.fields).length ? err.fields : { submit: err?.message || "Your rating couldn't be saved. Please try again." });
      setPhase("idle");
    }
  };

  return (
    <form aria-label={title} onSubmit={submit} noValidate className={`mt-4 ${CARD} flex flex-col gap-5`}>
      <div>
        <h2 className="text-sm font-semibold text-emerald-950">{title}</h2>
        <p className="mt-0.5 text-xs text-emerald-800/70">One rating per person. Rating again replaces your earlier one.</p>
      </div>

      <fieldset aria-describedby={errors.stars ? `${ids}-stars-error` : undefined}>
        <legend className="text-sm font-medium text-emerald-950">
          Overall <span className="font-normal text-emerald-800/60">(required)</span>
        </legend>
        <div className="mt-1.5 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500"
            >
              <input
                ref={n === 1 ? firstStar : undefined}
                type="radio"
                name={`${ids}-stars`}
                value={n}
                checked={stars === n}
                onChange={() => {
                  setStars(n);
                  setErrors((er) => ({ ...er, stars: undefined }));
                  touched();
                }}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className="sr-only"
              />
              <StarIcon filled={n <= stars} className="h-8 w-8" />
            </label>
          ))}
          <span className="ml-2 text-sm font-medium text-emerald-900" aria-live="polite">
            {stars ? STAR_WORDS[stars] : ""}
          </span>
        </div>
        {errors.stars && (
          <p id={`${ids}-stars-error`} role="alert" className="mt-1 text-xs font-medium text-red-600">
            {errors.stars}
          </p>
        )}
      </fieldset>

      <div>
        <button
          type="button"
          aria-expanded={showDetails}
          aria-controls={`${ids}-details`}
          onClick={() => setShowDetails((v) => !v)}
          className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-emerald-700"
        >
          <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${showDetails ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
          Add details (optional)
        </button>
        <AnimatePresence initial={false}>
          {showDetails && (
            <motion.div id={`${ids}-details`} {...fadeUp(reduced)} className="mt-2 flex flex-col gap-3">
              {Object.entries(RATING_LABELS).map(([key, label]) => (
                <fieldset key={key} className="flex flex-wrap items-center justify-between gap-2">
                  <legend className="float-left text-sm text-emerald-900">{label}</legend>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const on = categories[key] === n;
                      return (
                        <label
                          key={n}
                          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-xs font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500 ${
                            on ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`${ids}-${key}`}
                            value={n}
                            checked={on}
                            onChange={() => {
                              setCategories((c) => ({ ...c, [key]: n }));
                              touched();
                            }}
                            aria-label={`${label}: ${n}`}
                            className="sr-only"
                          />
                          {n}
                        </label>
                      );
                    })}
                    {categories[key] && (
                      <button
                        type="button"
                        onClick={() => {
                          setCategories(({ [key]: _gone, ...rest }) => rest);
                          touched();
                        }}
                        aria-label={`Clear ${label}`}
                        className="ml-1 min-h-9 px-1 text-xs text-emerald-800/60 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </fieldset>
              ))}
              {errors.categories && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {errors.categories}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div>
        <label htmlFor={`${ids}-comment`} className="mb-1.5 block text-sm font-medium text-emerald-950">
          Comment <span className="font-normal text-emerald-800/60">(optional)</span>
        </label>
        <textarea
          id={`${ids}-comment`}
          rows={3}
          maxLength={COMMENT_MAX_LENGTH}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setErrors((er) => ({ ...er, comment: undefined }));
            touched();
          }}
          aria-describedby={`${ids}-comment-help`}
          placeholder="What was it like?"
          className="w-full resize-none rounded-2xl border border-emerald-200 bg-white p-3.5 text-base text-emerald-950 placeholder:text-emerald-800/40 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none sm:text-sm"
        />
        <div className="mt-1 flex justify-between gap-2 text-xs">
          {errors.comment ? (
            <p role="alert" className="font-medium text-red-600">
              {errors.comment}
            </p>
          ) : (
            <span id={`${ids}-comment-help`} className="text-emerald-800/60">
              Shown to everyone, without your name.
            </span>
          )}
          <span className="shrink-0 tabular-nums text-emerald-800/60">
            {comment.length}/{COMMENT_MAX_LENGTH}
          </span>
        </div>
      </div>

      {errors.submit && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {errors.submit}
        </p>
      )}

      <AnimatePresence>
        {phase === "saved" && (
          <motion.p {...fadeUp(reduced)} role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5L20 7" />
            </svg>
            Thanks, your rating is saved.
          </motion.p>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={phase === "saving"}
        className="min-h-12 cursor-pointer rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 transition hover:bg-emerald-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
      >
        {phase === "saving" ? "Saving…" : saved ? "Update rating" : "Submit rating"}
      </button>
    </form>
  );
}
