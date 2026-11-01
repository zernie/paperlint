/**
 * THE GATES OF A PLAN V2 — what a measurement study fixes before its run so that its number can be
 * believed, and what its run must show after (docs/design/study-gates.md, issue #332).
 *
 * A plan says it is v2 by its `$schema`, `PLAN_V2`. A plan without it is v1 and is judged as before;
 * a measurement study registered on or after `PLAN_V2_FROM` must be v2 (`repro/study-registered`).
 *
 * The four gates, each with ONE way to say "not this study" — the literal `"none"` — and one way to
 * say "not decided yet" — null, which keeps the plan a draft. A key left out of a v2 plan is no plan:
 *
 *   we_lose_if     inside a decide-first mode only: the number in `result.json` and the threshold
 *                  at which the study's claim loses. An exploratory study has no claim to lose, and
 *                  cannot write one.
 *   second_check   per labelling step, the least Cohen's kappa between two raters on it.
 *   self_test      the check the study runs is first run on inputs whose answer is known: a script
 *                  that makes and runs them, or one input it must catch and one it must pass.
 *   funnel         the reasons a drawn unit may be dropped; the result counts each.
 *
 * After the run the study writes `result.json` (`RESULT_FILE`) beside its plan, and
 * `repro/study-result` judges it against these (src/domain/study-result.ts). What no machine sees: a
 * `"none"` that is false. The author's check of the plan is where that is caught. Pure.
 */

/** The `$schema` of a plan v2: the JSON Schema the package ships for it. */
export const PLAN_V2 =
  "https://unpkg.com/paperlint/schemas/plan.v2.schema.json";

/** A measurement study registered on this day or later must have a plan v2. */
export const PLAN_V2_FROM = "2026-10-31";

/** The one spelling of "this study has none of it". */
export const NONE = "none";
export type None = typeof NONE;

/** The claim loses when the number named `result` is below, or above, a threshold: exactly one. */
export type WeLoseIf =
  | { readonly result: string; readonly below: number }
  | { readonly result: string; readonly above: number };

/** One labelling step, judged by two raters: the least kappa between them it needs. */
export interface KappaStep {
  readonly step: string;
  readonly min_kappa: number;
}

export type SecondCheck = None | readonly KappaStep[];

/** The check is first run on known answers: made by a script, or a pair of inputs. Paths are in the study's folder. */
export type SelfTest =
  | None
  | { readonly made_by: string }
  | { readonly must_catch: string; readonly must_pass: string };

/** The reasons a drawn unit may be dropped, each once. */
export type Funnel = None | readonly string[];

/** The file a study of a plan v2 writes its numbers to, beside its plan. */
export const RESULT_FILE = "result.json";

/** Whether the number `value` makes the claim lose by `w`. */
export const loses = (w: WeLoseIf, value: number): boolean =>
  "below" in w ? value < w.below : value > w.above;

/** The threshold of `w`, and its side, in words: `below 0.2`. */
export const thresholdText = (w: WeLoseIf): string =>
  "below" in w ? `below ${String(w.below)}` : `above ${String(w.above)}`;
