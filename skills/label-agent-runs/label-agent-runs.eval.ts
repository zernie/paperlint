/**
 * label-agent-runs — the PAID tier: does this skill's description actually fire?
 *
 * The prompts live in `lib/skill-trigger-cases.mjs` beside every other skill's, so collisions with
 * `build-label-page` (the page a person labels on), `build-benchmark` (the statistics) and
 * `run-agent-grid` (running the grid) are visible in one table. Measures recall on its own
 * territory and precision against those siblings, against the real harness.
 *
 * ⚠️ NEVER RUN. Written with the skill; its rate is UNKNOWN, not assumed good.
 *
 * Costs money; not CI.
 *   node skills/label-agent-runs/label-agent-runs.eval.ts [trials]
 */
import { runSkillTriggerEval } from "../../lib/skill-eval-kit.mjs";

await runSkillTriggerEval("label-agent-runs");
