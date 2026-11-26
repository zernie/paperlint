/**
 * grow-real-papers — the PAID tier: does this skill's description fire on its own requests, and
 * stay quiet on a sibling's? Declared here, whole; `vigiles eval` discovers this file by its name.
 *
 * The should-not-fire prompts are the neighbours' territory: `add-venue` (a venue preset) and
 * `study-accepted-papers` (reading a venue's papers for a paper of one's own).
 *
 * ⚠️ NEVER RUN. Written with the skill; its rates are UNKNOWN, not assumed good.
 *
 * Costs money; not CI.
 *   npx vigiles eval .claude/skills/grow-real-papers/grow-real-papers.eval.ts
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineEval, skillResolved } from "vigiles";

/** The namespace vigiles installs a loose skills directory under. */
const LOOSE_NS = "vigiles-loose-skills";

export default defineEval({
  measureTriggerRate: {
    name: "grow-real-papers-trigger",
    skillsDir: dirname(dirname(fileURLToPath(import.meta.url))),
    prompts: [
      "grow the real-papers corpus, we have 206 and want about 280",
      "добавь ещё реальных статей в фикстуры, подними квоты",
      "the collector stopped halfway, resume the run",
      "raise the accepted-paper quotas for security and nlp and collect",
    ],
    irrelevantPrompts: [
      "add this workshop to paperlint as a venue preset",
      "what does this venue's accepted papers tell us about our draft",
      "fix the failing unit test in src/presets.test.ts",
      "числа есть, пора писать текст",
    ],
    fired: (trace) => skillResolved(trace, `${LOOSE_NS}:grow-real-papers`),
    // Four named phrasings per side, deliberately, as for every skill of this package.
    minPrompts: 4,
  },
});
