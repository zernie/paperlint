/**
 * The one assertion helper every harness uses.
 *
 * Until #52 each harness defined its own `check()`, and the copies had drifted: some printed a
 * detail on failure and some dropped it, some joined it with " — " and some with a newline, and two
 * passed the LABEL to vigiles' `recordCheck(n)`, which adds its argument to a number — so the
 * recorded count became a string. One helper removes the drift instead of documenting it.
 *
 * What it guarantees:
 *   - a failure names the label AND the detail, on stderr and in the thrown assertion — the detail
 *     is what makes a red run diagnosable without re-running it;
 *   - `detail` may be a function, so an expensive rendering is paid only on failure;
 *   - every call is counted (`check.count`) and reported to the vigiles runner (`recordCheck`), so
 *     a harness's summary line and the runner's check count come from the same place.
 */
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { recordCheck } from "vigiles";

/** A failure detail: text, any value (rendered with `util.inspect`), or a thunk producing one. */
export type Detail = unknown;

/** `check(label, cond, detail?)`, and how many times it has been called. */
export interface Check {
  (label: string, cond: unknown, detail?: Detail): void;
  readonly count: number;
}

/** A detail given as a function, so it is only built on failure. */
const isThunk = (d: Detail): d is () => unknown => typeof d === "function";

/** A failure detail as text: strings verbatim, other values through `util.inspect`, a thunk called. */
export function renderDetail(detail: Detail): string {
  const value: unknown = isThunk(detail) ? detail() : detail;
  if (value === undefined || value === null || value === "") return "";
  return typeof value === "string" ? value : inspect(value, { depth: 6 });
}

/** The label, then the detail: on the same line when it is one line, below it when it is many. */
export function failureMessage(label: string, detail: Detail): string {
  const shown = renderDetail(detail);
  if (!shown) return label;
  return shown.includes("\n") ? `${label}\n${shown}` : `${label} — ${shown}`;
}

/**
 * A fresh `check(label, cond, detail?)`. `check.count` is how many times it has been called.
 * `log` is where a failure is printed — stderr unless this module's own test injects one.
 */
export function createChecker({
  log = console.error,
}: { log?: (line: string) => void } = {}): Check {
  const check = (label: string, cond: unknown, detail?: Detail): void => {
    check.count++;
    recordCheck();
    if (cond) return;
    const message = failureMessage(label, detail);
    log(`✗ ${message}`);
    assert.fail(message);
  };
  check.count = 0;
  return check;
}
