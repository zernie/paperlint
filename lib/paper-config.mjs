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
export const CONFIG_KEY = "research-paper-pipeline";

/** Default: a consumer that declares nothing is assumed to keep papers in `papers/`. */
export const DEFAULT_PAPERS_ROOT = "papers";

/**
 * The field under CONFIG_KEY that names the papers directory:
 * `"research-paper-pipeline": { "papersDir": "papers" }`.
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
