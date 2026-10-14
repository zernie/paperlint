/**
 * label-agent-runs — the PAID tier: does this skill's description actually fire?
 *
 * The prompts live beside this file, in `trigger-cases.json` (read through `lib/skill-trigger-cases.mjs`,
 * which resolves each collider's prompts from its own colocated file or the shared table). Collisions with
 * `build-label-page` (the page a person labels on), `build-benchmark` (the statistics) and
 * `run-agent-grid` (running the grid) are declared there. Measures recall on its own
 * territory and precision against those siblings, against the real harness.
 *
 * ⚠️ NEVER RUN. Written with the skill; its rate is UNKNOWN, not assumed good.
 *
 * Costs money; not CI.
 *   node skills/label-agent-runs/label-agent-runs.eval.ts [trials]
 */
import { runSkillTriggerEval } from "../../lib/skill-eval-kit.mjs";

await runSkillTriggerEval("label-agent-runs");
