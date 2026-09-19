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
