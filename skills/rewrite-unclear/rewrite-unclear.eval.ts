/**
 * rewrite-unclear — the PAID tier: does this skill's description fire when an author says a passage
 * is unclear, and stay quiet on requests that belong to the skills it hands over to?
 *
 * Declared here, whole: the prompts it must fire on, the prompts it must not, and the measurement.
 * `vigiles eval` discovers this file by its name and runs it; nothing runs at import.
 *
 * The should-fire set is phrased the way authors complain about a passage (measured before this
 * skill existed: twelve such phrases, two trials each, fired no shipped skill at all). The
 * should-not-fire set is the neighbours: a length cut (`tighten-paper`), a request for a writing
 * grade, a read of the last edit (`cold-read-diff`) and the argument's order (`argument-arc`).
 *
 * Costs money; not CI.
 *   npx vigiles eval skills/rewrite-unclear/rewrite-unclear.eval.ts
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineEval, skillResolved } from "vigiles";

/** The namespace vigiles installs a loose skills directory under. */
const LOOSE_NS = "vigiles-loose-skills";

export default defineEval({
  measureTriggerRate: {
    name: "rewrite-unclear-trigger",
    skillsDir: dirname(dirname(fileURLToPath(import.meta.url))),
    prompts: [
      "this paragraph in the intro is unclear, make it simpler",
      "эту часть я не понимаю, что тут написано — перепиши понятнее",
      "the heading of section 2 is vague, name the actual thing",
      "simplify the introduction without cutting anything, length is fine",
      "too many terms nobody defined in section 3, make it readable",
    ],
    irrelevantPrompts: [
      "the paper is two pages over the limit, what can we cut",
      "grade how the whole paper reads, score each dimension",
      "I just edited section 4, did the change land for someone with no context?",
      "the sections don't build on each other, the reader can't tell where the argument goes",
    ],
    fired: (trace) => skillResolved(trace, `${LOOSE_NS}:rewrite-unclear`),
    minPrompts: 4,
    // A paper with one paragraph to point at.
    fixture: {
      "paper/paper.tex":
        "\\section{Introduction}\nThe cache is not the slow part; the parse is.\n",
    },
  },
});
