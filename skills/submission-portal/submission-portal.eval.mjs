/**
 * submission-portal — the PAID tier: does this skill's description actually fire?
 *
 * The prompts live in `lib/skill-trigger-cases.mjs` beside every other skill's, so collisions with
 * `submit-paper` and `osf-artifact-upload` are visible in one table. Measures recall on its own
 * territory and precision against those siblings, against the real harness.
 *
 * ⚠️ NEVER RUN. Written 2026-10-03 with the skill; its rate is UNKNOWN, not assumed good.
 *
 * Costs money; not CI.
 *   node skills/submission-portal/submission-portal.eval.mjs [trials]
 */
import { runSkillTriggerEval } from "../../lib/skill-eval-kit.mjs";

await runSkillTriggerEval("submission-portal");
