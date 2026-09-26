/**
 * Where the consumer declares its settings — the ONE SOURCE for everything that is allowed to
 * import it.
 *
 * 🔴 WHY THIS MODULE DOES NOT REMOVE THE DUPLICATION COMPLETELY, AND THAT IS NOT AN OVERSIGHT.
 * The three hooks (`hooks/*.hook.mjs`) still have to keep their own copies of these values: a
 * compiled hook is forbidden to import anything but `vigiles/hook`, and that ban is not
 * arbitrary — a hook's capabilities equal its API surface, so allowing imports would mean
 * allowing a reach into `child_process`. The restriction is wider than strictly necessary
 * (importing plain constants adds no capability), and that is discussed in zernie/vigiles#245,
 * but until it is relaxed the hooks duplicate, and drift is caught by the cross-check in
 * `hooks/hooks.harness.mjs`.
 *
 * 🔴 BUT THE REST WERE DUPLICATING FOR NO REASON AT ALL. `eslint-rules/papers.mjs` and
 * `skills/paper-pipeline/scripts/consumer.mjs` are not hooks, carry no import restriction, and
 * could always have taken the value from here. Worse, their copies were not covered by the
 * cross-check at all — it compared the three hooks against each other, while these two lived
 * next door and could drift apart silently. Found 2026-09-18 by grepping AFTER the cross-check
 * itself had already been fixed — i.e. the check's wording was fixed, but nobody measured its
 * COVERAGE.
 */

/** The key in the consumer's `package.json` this package's settings are read from. */
export const CONFIG_KEY = "paperlint";

/**
 * THE THREE LEVELS OF SETTINGS, each named after the tool:
 *
 *   package.json → "paperlint"     the project: where the papers are, what every paper gets
 *   <paper>/paperlint.json         one paper: the venue preset it extends, its kind, its own rules
 *   a venue preset                 one venue: its format, TeX packages and rules — shipped with
 *                                  paperlint (`paperlint:<name>`) or the project's own (`./x.jsonc`)
 */
export const PAPER_SETTINGS_FILE = "paperlint.json";

/**
 * Every key `paperlint.json` may hold. Any other key is REFUSED with its name: a typo would
 * otherwise read as "not set". `$comment` is JSON Schema's own keyword for a comment, the one way
 * to leave a note in a JSON file; paperlint ignores its value.
 */
export const PAPER_SETTINGS_KEYS = Object.freeze({
  extends:
    "the venue preset: paperlint:<name> or ./path.jsonc — the pdf/ venue rules, paperlint build",
  kind: "the kind of paper, whose page limit applies — pdf/limits",
  pdf: "where the built PDF is, relative to the paper, when it is not paper.pdf — the facts",
  rules: "rule overrides for this paper alone — paperlint lint",
  $comment: "a note for humans; ignored",
});

/**
 * The settings object in a parsed `package.json`, or undefined when there is none (or it is not
 * an object).
 */
export function settingsOf(pkg) {
  const v =
    pkg !== null && typeof pkg === "object" && Object.hasOwn(pkg, CONFIG_KEY)
      ? pkg[CONFIG_KEY]
      : undefined;
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? v
    : undefined;
}

/** Default: a consumer that declares nothing is assumed to keep papers in `papers/`. */
export const DEFAULT_PAPERS_ROOT = "papers";

/**
 * The field under CONFIG_KEY that names the papers directory:
 * `"paperlint": { "papersDir": "papers" }`.
 *
 * This is the one place the name is spelled. Code reads the field as
 * `settings[PAPERS_DIR_FIELD]`, never by a literal, so renaming it again is a one-line change
 * here. The three hooks cannot import this module, so they keep their own copy, and
 * `lib/paper-config.harness.mjs` checks that every copy matches this one.
 */
export const PAPERS_DIR_FIELD = "papersDir";

/**
 * Every key the settings object may hold, with who reads it. A key not listed here is REFUSED
 * with its name (`paperlint lint`, `paperlint build`, `paperlint new`, `paperlint doctor` all read through the same
 * parser), because a typo in a key otherwise reads as "not set" — the defect `src/types.ts` names
 * in its first line.
 *
 * 🔴 ONE LIST, AND IT IS CHECKED AGAINST THE READERS, NOT TRUSTED. The settings object has readers
 * all over the package (the CLI, the skill scripts, the trigger-case loader), each reading its own
 * keys. `lib/paper-config.harness.mjs` walks the package's source, finds every
 * `[CONFIG_KEY]?.<key>` read and every field of `PaperlintConfig`, and requires each to be here — so a
 * new reader that forgets this list turns the harness red before a consumer's config does.
 */
export const SETTINGS_KEYS = Object.freeze({
  papersDir: "the papers directory (required) — every command, the hooks",
  structure: "which files a paper directory must hold — paperlint lint",
  rules:
    "extra ESLint config blocks, appended after paperlint's own — paperlint lint",
  ledger: "the run ledger — skills/paper-pipeline/scripts/consumer.mjs",
  scripts: "how skill prose names the scripts — consumer.mjs",
  timezone: "dates in the ledger — consumer.mjs",
  contactEmail: "the polite-pool address for citation lookups — consumer.mjs",
  citeChecks: "the consumer's citation checkers — run-mechanical.mjs",
  triggerCases:
    "the consumer's own skill trigger cases — lib/skill-trigger-cases.mjs",
});
