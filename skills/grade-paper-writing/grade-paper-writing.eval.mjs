/**
 * grade-paper-writing — the PAID tier: does this skill's description actually fire?
 *
 * COLOCATED ON PURPOSE (vigiles decides coverage by placement as of 2026-08-11).
 * The prompts live in `.claude/lib/skill-trigger-cases.mjs` so all 21 cases
 * are reviewed as one table where collisions between siblings are visible;
 * copying them here would recreate the drift that rule exists to prevent.
 *
 * Measures recall (fires on its own territory) AND precision (stays quiet on a
 * colliding sibling's territory), against the REAL `.claude` harness so the skill
 * competes with every other installed description — an isolated run overstates
 * recall and understates false positives.
 *
 * Costs money; not CI.
 *   node .claude/skills/grade-paper-writing/grade-paper-writing.eval.mjs [trials]
 */
import { runSkillTriggerEval } from "../../lib/skill-eval-kit.mjs";

await runSkillTriggerEval("grade-paper-writing");
