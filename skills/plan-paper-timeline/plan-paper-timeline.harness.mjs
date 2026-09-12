/**
 * plan-paper-timeline — the free, deterministic tier. No model, no network.
 *
 * COLOCATED ON PURPOSE. vigiles decides coverage by PLACEMENT as of 2026-08-11:
 * a test that merely names a surface no longer counts, because that tier was
 * crediting surfaces nothing touched. So each skill needs a file inside its own
 * directory — this one.
 *
 * The assertions live in `.claude/lib/skill-checks.mjs` and are CALLED here with
 * this skill's name. They are not copied: 22 copies of the same checks is the drift that
 * module exists to avoid. (Until 2026-08-11 this was an env-var side channel into a
 * 614-line file named after no surface; it is a function call now.)
 *
 * What this proves: this skill's frontmatter parses as strict YAML, its declared
 * tool contract is sane, its pipeline wiring points at scripts that exist, and it
 * announces/records under ITS OWN identity rather than a sibling's.
 *
 * What it does NOT prove: that the skill fires, or that its guidance produces a
 * good result. Those need a real model — see `plan-paper-timeline.eval.mjs`.
 */
import { checkSkill } from "../../lib/skill-checks.mjs";

await checkSkill("plan-paper-timeline");
