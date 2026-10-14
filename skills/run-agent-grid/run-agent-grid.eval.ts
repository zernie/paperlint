/**
 * run-agent-grid — the PAID tier: does this skill's description actually fire?
 *
 * The prompts live beside this file, in `trigger-cases.json` (read through `lib/skill-trigger-cases.mjs`,
 * which resolves each collider's prompts from its own colocated file or the shared table). Collisions with
 * `build-benchmark` (the design) and `build-label-page` (the hand labels) are declared there.
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
