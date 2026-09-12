/**
 * paper-status — the free, deterministic tier. No model, no network.
 *
 * 🔴 THIS SKILL WAS NOT MERELY UNTESTED — IT WAS UNREACHABLE BY THE HARNESS.
 * `skill-corpus.mjs` carried `paper-status` in an EXCLUDED map whose recorded
 * reason is "it has no gate row", a statement about ONE assertion. The code
 * filtered it out of the checked set ENTIRELY, so it also skipped the strict-YAML
 * frontmatter parse, the tool contract, the script-paths check and the identity
 * check. Adding a file here would have thrown ("not a wired pipeline skill")
 * rather than testing anything. Fixed 2026-08-11: the exclusion now applies at
 * assertion 12b alone, and the sweep went 21 skills to 22.
 *
 * That is the general shape worth remembering: a surface can read as untested
 * when the missing piece is not a test file but a filter upstream of it.
 *
 * The assertions live in `.claude/lib/skill-checks.mjs` and are CALLED with this
 * skill's name — not copied. 22 copies of the same checks is the drift that module
 * exists to prevent.
 *
 * What it does NOT prove: that the skill fires, or that its report is right.
 * See `paper-status.eval.mjs`.
 */
import { checkSkill } from "../../lib/skill-checks.mjs";

await checkSkill("paper-status");
