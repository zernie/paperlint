/**
 * build-label-page — the PAID tier: does this skill's description actually fire?
 *
 * The prompts live in `lib/skill-trigger-cases.mjs` beside every other skill's, so collisions with
 * `build-benchmark` and `draft-paper` are visible in one table. Measures recall on its own
 * territory and precision against those siblings, against the real harness.
 *
 * ⚠️ NEVER RUN. Written 2026-10-12 with the skill; its rate is UNKNOWN, not assumed good.
 *
 * Costs money; not CI.
 *   node skills/build-label-page/build-label-page.eval.mjs [trials]
 */
import { runSkillTriggerEval } from "../../lib/skill-eval-kit.mjs";

await runSkillTriggerEval("build-label-page");
