import { useEffect, useLayoutEffect, useRef } from "react";
import { OTP_LENGTH, digitsOnly } from "../utils/phoneAuth";

const BOX =
  "h-12 min-w-0 flex-1 rounded-xl border bg-white text-center text-xl font-semibold tabular-nums text-emerald-950 caret-emerald-600 outline-none transition-colors focus:ring-2 disabled:bg-emerald-50/60";
// In the error state every box keeps the red border, the focused one included (its ring shows focus).
const BOX_ERROR = "border-red-400 focus:border-red-400 focus:ring-red-200";
const BOX_FILLED = "border-emerald-400 focus:border-emerald-600 focus:ring-emerald-200";
const BOX_EMPTY = "border-emerald-200 focus:border-emerald-600 focus:ring-emerald-200";

/**
 * Six one-digit boxes that behave like one field: typing moves to the next
 * box, Backspace on an empty box goes back, the arrow keys move between
 * boxes, and a pasted or autofilled code (SMS "one-time-code") fills them
 * all. A full code always starts at the first box, wherever it lands.
 *
 * `value` is the digits entered so far, as one string with no gaps, so a box
 * past the next empty one sends focus back to that empty one.
 */
export default function OtpBoxes({ value, onChange, labelledBy, describedBy, invalid = false, disabled = false, autoFocus = false, focusKey = 0 }) {
  const refs = useRef([]);
  // The newest value, including one just sent to onChange that hasn't come
  // back as `value` yet, so moving focus right after typing isn't undone.
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");
  const update = (next) => {
    latest.current = next;
    onChange(next);
  };

  const focusBox = (i) => {
    const el = refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };

  // On arrival, and whenever the caller asks again (a new code was sent, or a code was refused).
  useEffect(() => {
    if (autoFocus) focusBox(0);
  }, [autoFocus, focusKey]);

  /** Writes `incoming` digits from box `at` on; returns the box to focus next. */
  const write = (at, incoming) => {
    if (incoming.length >= OTP_LENGTH) {
      update(incoming.slice(0, OTP_LENGTH));
      return OTP_LENGTH - 1;
    }
    const current = latest.current;
    const pos = Math.min(at, current.length);
    const next = (current.slice(0, pos) + incoming + current.slice(pos + incoming.length)).slice(0, OTP_LENGTH);
    update(next);
    return Math.min(pos + incoming.length, OTP_LENGTH - 1);
  };

  const handleChange = (i, e) => {
    const raw = e.target.value;
    let typed = digitsOnly(raw, OTP_LENGTH * 2);
    if (!typed) {
      // The box was cleared (or a non-digit was typed into an empty box).
      if (digits[i]) update(value.slice(0, i) + value.slice(i + 1));
      return;
    }
    if (digits[i] && raw.length === 2) {
      // Typed beside the digit already there (focus normally selects it, so
      // this is rare): keep only the new character, the one before the caret.
      typed = digitsOnly(raw[(e.target.selectionStart ?? 2) - 1] ?? "", 1);
      if (!typed) return;
    }
    focusBox(write(i, typed));
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      update(value.slice(0, i - 1));
      focusBox(i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) {
      e.preventDefault();
      focusBox(i + 1);
    }
  };

  const handlePaste = (i, e) => {
    const pasted = digitsOnly(e.clipboardData?.getData("text") ?? "", OTP_LENGTH * 4);
    e.preventDefault();
    if (pasted) focusBox(write(i, pasted));
  };

  const handleFocus = (i, e) => {
    // No gaps: a box past the next empty one hands focus to that one.
    const filled = latest.current.length;
    if (i > filled) focusBox(filled);
    else e.target.select();
  };

  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="flex gap-1.5">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          // The first box takes a whole autofilled code; the others hold one digit.
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? OTP_LENGTH : 1}
          aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => handleFocus(i, e)}
          className={`${BOX} ${invalid ? BOX_ERROR : digit ? BOX_FILLED : BOX_EMPTY}`}
        />
      ))}
    </div>
  );
}
