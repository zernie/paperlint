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
 * The key's name before 2.0.0, when the package was `research-paper-pipeline`. Still READ, with a
 * deprecation line from the CLI and `doctor`; `init` renames it. Both keys at once with different
 * contents is refused: there is no way to know which one the author means.
 */
export const LEGACY_CONFIG_KEY = "research-paper-pipeline";

/**
 * Where a parsed `package.json` keeps this package's settings — the new key, else the old one.
 *
 * @returns `settings` (undefined when neither key is there, or on a conflict), `legacy` (read
 *   from the old key), `conflict` (the message when both keys are there and differ, else null).
 */
export function declaredSettings(pkg) {
  const has = (k) =>
    pkg !== null && typeof pkg === "object" && Object.hasOwn(pkg, k);
  const current = has(CONFIG_KEY);
  const legacy = has(LEGACY_CONFIG_KEY);
  if (
    current &&
    legacy &&
    JSON.stringify(pkg[CONFIG_KEY]) !== JSON.stringify(pkg[LEGACY_CONFIG_KEY])
  )
    return {
      settings: undefined,
      legacy: false,
      conflict:
        `package.json has both "${CONFIG_KEY}" and "${LEGACY_CONFIG_KEY}", and they differ. ` +
        `Keep "${CONFIG_KEY}" and delete "${LEGACY_CONFIG_KEY}" (its old name).`,
    };
  if (current)
    return { settings: pkg[CONFIG_KEY], legacy: false, conflict: null };
  if (legacy)
    return { settings: pkg[LEGACY_CONFIG_KEY], legacy: true, conflict: null };
  return { settings: undefined, legacy: false, conflict: null };
}

/**
 * The settings object alone, for readers that only need a value: the new key, else the old one,
 * and nothing on a conflict (the CLI, `doctor` and the edit guard report the conflict).
 */
export function settingsOf(pkg) {
  const d = declaredSettings(pkg);
  return d.conflict === null ? d.settings : undefined;
}

/** The deprecation line for settings read from the old key. */
export const LEGACY_KEY_MESSAGE = `"${LEGACY_CONFIG_KEY}" in package.json is the old name of this package's key — rename it to "${CONFIG_KEY}". \`npx paperlint init\` does it for you.`;

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
 * The field's old name. A config that still has it is REFUSED with `renamedFieldMessage()`,
 * even if it also has the new one: the package is unpublished, so there is nobody to migrate
 * quietly, and reading the old name as a fallback would leave it working forever.
 */
export const OLD_PAPERS_DIR_FIELD = "papers";

/**
 * The error text for a config that still uses the old field name, or `null` when it does not.
 *
 * @param settings  the object under CONFIG_KEY (or the whole `rpp.json`)
 * @param where     where that object lives, as the reader should see it in the message
 */
export function renamedFieldMessage(
  settings,
  where = `package.json → "${CONFIG_KEY}"`,
) {
  if (settings === null || typeof settings !== "object") return null;
  if (!Object.hasOwn(settings, OLD_PAPERS_DIR_FIELD)) return null;
  return `"${OLD_PAPERS_DIR_FIELD}" was renamed to "${PAPERS_DIR_FIELD}" in ${where}`;
}

/**
 * Every key the settings object may hold, with who reads it. A key not listed here is REFUSED
 * with its name (`rpp lint`, `rpp build`, `rpp new`, `rpp doctor` all read through the same
 * parser), because a typo in a key otherwise reads as "not set" — the defect `src/types.ts` names
 * in its first line.
 *
 * 🔴 ONE LIST, AND IT IS CHECKED AGAINST THE READERS, NOT TRUSTED. The settings object has readers
 * all over the package (the CLI, the skill scripts, the trigger-case loader), each reading its own
 * keys. `lib/paper-config.harness.mjs` walks the package's source, finds every
 * `[CONFIG_KEY]?.<key>` read and every field of `RppConfig`, and requires each to be here — so a
 * new reader that forgets this list turns the harness red before a consumer's config does.
 */
export const SETTINGS_KEYS = Object.freeze({
  papersDir: "the papers directory (required) — every command, the hooks",
  structure: "which files a paper directory must hold — rpp lint",
  authorListCommand: "paper/author-list — rpp lint",
  typographyDebt: "paper/typography — rpp lint",
  docFields: "doc/fields — rpp lint",
  reviewSince: "review/findings-cause — rpp lint",
  minFindings: "review/findings-cause — rpp lint",
  causeMarker: "review/findings-cause — rpp lint",
  rules: "extra ESLint config blocks, appended after rpp's own — rpp lint",
  buildScripts: "REMOVED; still named so rpp build can say it is ignored",
  ledger: "the run ledger — skills/paper-pipeline/scripts/consumer.mjs",
  scripts: "how skill prose names the scripts — consumer.mjs",
  timezone: "dates in the ledger — consumer.mjs",
  contactEmail: "the polite-pool address for citation lookups — consumer.mjs",
  citeChecks: "the consumer's citation checkers — run-mechanical.mjs",
  triggerCases:
    "the consumer's own skill trigger cases — lib/skill-trigger-cases.mjs",
});
