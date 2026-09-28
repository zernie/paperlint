/**
 * What every e2e test file needs from the environment, and what happens when it is not there.
 *
 * 🔴 A SKIP IS NOT A PASS. An e2e test needs something a clone may not have — TeX Live, pnpm, a
 * directory to install TeX Live into. On a contributor's machine its absence is a legitimate
 * skip, and vitest reports the tests as SKIPPED, not passed (`npm run check` reads that count from
 * vitest's JSON report). In CI the same absence is a broken environment: under `STRICT` the file
 * gets one extra test that fails and names what is missing, so a green CI run cannot be a run
 * that measured nothing.
 *
 * Named without `.e2e.ts`, so the e2e projects' glob does not take it for a test file.
 */
import { expect, it } from "vitest";

/**
 * Strict: missing tools fail instead of skipping. GitHub Actions sets `CI=true` on every runner;
 * `PAPERLINT_E2E_STRICT=1` asks for the same locally.
 */
export const STRICT: boolean =
  (process.env.CI !== undefined &&
    process.env.CI !== "" &&
    process.env.CI !== "false") ||
  process.env.PAPERLINT_E2E_STRICT === "1";

/**
 * Declare that the tests after this call need `what`. Returns true when they must be SKIPPED
 * (pass it to `describe.skipIf`). Under STRICT a missing `what` also registers a failing test that
 * says so; `why` is what a reader needs to make it present.
 */
export function missing(what: string, present: boolean, why = ""): boolean {
  if (!present && STRICT)
    it(`strict: ${what} is present`, () => {
      expect.fail(
        `${what} is missing${why ? ` — ${why}` : ""}. Under CI (or PAPERLINT_E2E_STRICT=1) a missing tool is a broken environment, not a skip.`,
      );
    });
  return !present;
}

/**
 * One labelled check inside a scenario: it records the failure and lets the scenario go on, so a
 * run reports every mismatch, not the first. `detail` is shown only on failure.
 */
export function check(label: string, cond: boolean, detail = ""): void {
  expect.soft(cond, detail ? `${label} — ${detail}` : label).toBe(true);
}
