/**
 * Types for `skill-eval-kit.mjs`, for the TypeScript eval files that call it. Only what they call
 * is declared; the module stays JavaScript.
 */

/** Run one skill's trigger case against a real model (PAID): recall on its prompts, precision on its colliders'. */
export function runSkillTriggerEval(
  skill: string,
  opts?: { trials?: number },
): Promise<void>;
