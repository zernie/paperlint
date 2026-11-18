/**
 * Types for `skill-checks.mjs`, for the TypeScript tests that call it. Only what they call is
 * declared; the module stays JavaScript.
 */

/** The shared per-skill checks for `skills/<name>/SKILL.md`; rejects naming every failure. */
export function checkSkill(name: string): Promise<void>;

/** The skills a SKILL.md requires, each named by a `**Required sub-skill:**` marker, in order. */
export function requiredSkills(src: string): string[];

/** Asserts a soundness- or novelty-scoring skill points to the shared venue-bar reference and carries the fallback line. */
export function checkVenueBar(name: string): number;
