/**
 * add-venue — the PAID tier: does this skill's description fire on its own requests, and stay
 * quiet on a sibling's? Declared here, whole; `vigiles eval` discovers this file by its name.
 *
 * The should-not-fire prompts are the neighbours' territory: `find-venue` (choosing a venue),
 * `submit-paper` and `submission-portal` (submitting).
 *
 * ⚠️ NEVER RUN. Written with the skill; its rates are UNKNOWN, not assumed good.
 *
 * Costs money; not CI.
 *   npx vigiles eval .claude/skills/add-venue/add-venue.eval.ts
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineEval, skillResolved } from "vigiles";

/** The namespace vigiles installs a loose skills directory under. */
const LOOSE_NS = "vigiles-loose-skills";

export default defineEval({
  measureTriggerRate: {
    name: "add-venue-trigger",
    skillsDir: dirname(dirname(fileURLToPath(import.meta.url))),
    prompts: [
      "add this workshop to paperlint as a venue preset, here is its call for papers",
      "paperlint не знает эту конференцию — напиши для неё preset и карточку по call for papers",
      "turn the CFP at this URL into presets/<name>.jsonc with a quote beside every page limit",
      "добавь воркшоп в список площадок paperlint: лимит страниц, шаблон, дедлайн",
    ],
    irrelevantPrompts: [
      "which workshop should this paper go to, rank the candidates by deadline and credit",
      "replace the PDF on hotcrp with the new build",
      "ready to submit — walk me through anonymization and the form",
      "числа есть, пора писать текст",
    ],
    fired: (trace) => skillResolved(trace, `${LOOSE_NS}:add-venue`),
    // Four named phrasings per side, deliberately, as for every skill of this package.
    minPrompts: 4,
  },
});
