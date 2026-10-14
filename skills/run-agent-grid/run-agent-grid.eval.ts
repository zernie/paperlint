/**
 * run-agent-grid — the PAID tier: does this skill's description actually fire?
 *
 * The prompts live in `lib/skill-trigger-cases.mjs` beside every other skill's, so collisions with
 * `build-benchmark` (the design) and `build-label-page` (the hand labels) are visible in one table.
 * Measures recall on its own territory and precision against those siblings, against the real
 * harness.
 *
 * ⚠️ NEVER RUN. Written with the skill; its rate is UNKNOWN, not assumed good.
 *
 * Costs money; not CI.
 *   node skills/run-agent-grid/run-agent-grid.eval.ts [trials]
 */
import { runSkillTriggerEval } from "../../lib/skill-eval-kit.mjs";

await runSkillTriggerEval("run-agent-grid");
