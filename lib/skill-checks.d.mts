/**
 * Types for `skill-checks.mjs`, for the TypeScript tests that call it. Only what they call is
 * declared; the module stays JavaScript.
 */

/** The shared per-skill checks for `skills/<name>/SKILL.md`; rejects naming every failure. */
export function checkSkill(name: string): Promise<void>;
