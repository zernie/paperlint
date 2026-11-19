/**
 * NAMED RULE SETS — opt-in rules grouped so an author turns them on in one line (#524).
 *
 *   "rules": { "paperlint:writing": "warn" }
 *
 * A set is written where a rule id is written, in the `rules` key of the root or a paper's
 * `paperlint.json` (or in a block of it), and is expanded there, at the boundary
 * (`parseRuleEntries`, src/rules-config.ts), into one entry per member at the set's severity. Nothing
 * after the parser knows a set existed. The members keep the set's place among the entries, so a
 * later entry wins, as in ESLint: `{ "paperlint:writing": "warn", "tex/register": "off" }` is the set
 * without `tex/register`, and `["warn", { … }]` after the set gives one member its options.
 *
 * ── WHY A `rules` ENTRY AND NOT `extends` ─────────────────────────────────────────
 * `extends` names the paper's venue preset: one string (an array is refused: «"extends" must be a
 * non-empty string»), read as the venue by the build, the facts file, the folder-name rule and the
 * cycles, and derived from the current cycle when a paper keeps `cycles`, where writing `extends` is
 * refused. A set beside the venue there would need a second meaning for that key. textlint turns
 * a preset on the same way, as an entry of `rules` (`"preset-example": true`); typescript-eslint
 * keeps its style rules in `stylistic`, apart from `recommended` — as this set is apart from the
 * default set.
 *
 * ── WHAT A SET HOLDS ──────────────────────────────────────────────────────────────
 * Only rules that are off by default (`rule-sets.test.ts` holds it): turning a set off gives back
 * the default set, never less. A rule a venue requires is not here: its preset turns it on with the
 * venue's options and level (`tex/heading-case` on AgenticDev), and a set entry after the preset
 * would lower it to the set's severity. Nor is a rule that holds only for papers of one markup
 * convention: `tex/term-before-definition` and `tex/term-defined-twice` read `\emph` as a definition,
 * and on a paper that uses it for stress, or not at all, they report that they check nothing
 * (measured: one such warning on every paper of `paper-includes.test.ts` with them in the set).
 */

/** The prefix a set's name shares with a shipped preset's spec: both are paperlint's own. */
export const SET_PREFIX = "paperlint:";

/**
 * `paperlint:writing` — every rule that flags the WRITING rather than what the venue decides: the
 * typography preferences `--fix` rewrites, register and provenance proxies, length and density
 * caps. Each runs with its own default options.
 */
export const WRITING_SET: readonly string[] = [
  "paper/section-word",
  "paper/leading-zero",
  "paper/figure-ref-style",
  "tex/claim-provenance",
  "tex/register",
  "tex/contrast-frames",
  "tex/claim-emphasis",
  "tex/relation-markers",
  "tex/negated-sentences",
  "tex/max-paragraph-words",
  "tex/max-paragraph-numbers",
  "tex/max-sentence-words",
  "tex/max-caption-words",
];

/** Every set, by the name written in `rules`. */
export const RULE_SETS: ReadonlyMap<string, readonly string[]> = new Map([
  [`${SET_PREFIX}writing`, WRITING_SET],
]);

/** The members of the set `name`, or null when `name` names no set. */
export const setMembers = (name: string): readonly string[] | null =>
  RULE_SETS.get(name) ?? null;
