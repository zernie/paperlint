/**
 * Types for `skill-trigger-cases.mjs`, for the TypeScript tests that read it. Only what they read
 * is declared; the module stays JavaScript.
 */

/** One skill's trigger case: the prompts it must fire on, and the siblings whose prompts it must not take. */
export interface TriggerCase {
  readonly skill: string;
  readonly why: string;
  readonly prompts: readonly string[];
  readonly collides: readonly string[];
}

/** The file a skill's colocated cases live in, inside the skill's directory. */
export const TRIGGER_CASES_FILE: string;
/** The rows still in the shared table — frozen; the set may only shrink. */
export const SHARED_CASES: readonly TriggerCase[];
/** The rows that live beside their skills, in `skills/<name>/trigger-cases.json`. */
export const COLOCATED_CASES: readonly TriggerCase[];
/** Every case: shared, colocated, then the consumer's own. */
export const CASES: readonly TriggerCase[];
/** Case lookup by skill name. */
export const BY_SKILL: ReadonlyMap<string, TriggerCase>;
/** Read `<dir>/<skill>/trigger-cases.json` for every skill that has one; throws on a malformed file or a skill also in `shared`. */
export function colocatedCases(
  dir?: string,
  shared?: readonly TriggerCase[],
): TriggerCase[];
/** The false-positive prompts for `skill`: its colliders' should-fire prompts. */
export function irrelevantFor(skill: string, want?: number): string[];
