/**
 * label-agent-runs — the PAID tier: does this skill's description fire on its own requests, and
 * stay quiet on a sibling's?
 *
 * Declared here, whole: the prompts it must fire on, the prompts it must not, and the
 * measurement — no shared table, no kit. `vigiles eval` discovers this file by its name and runs
 * it; nothing runs at import.
 *
 * The should-not-fire set is `run-agent-grid`'s own requests, imported from its eval file (the
 * sibling it is most easily confused with), plus `build-label-page` (a page a person labels on)
 * and `build-benchmark` (the statistics), written inline.
 *
 * The skills it competes with are every skill this package ships (the `skills/` directory this
 * file sits in), the same set in a checkout and in `node_modules`.
 *
 * ⚠️ NEVER RUN. Written with the skill; its rates are UNKNOWN, not assumed good.
 *
 * Costs money; not CI.
 *   npx vigiles eval skills/label-agent-runs/label-agent-runs.eval.ts
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineEval, skillResolved } from "vigiles";
import { TRIGGER_PROMPTS as GRID } from "../run-agent-grid/run-agent-grid.eval.ts";

/** The namespace vigiles installs a loose skills directory under. */
const LOOSE_NS = "vigiles-loose-skills";

export default defineEval({
  measureTriggerRate: {
    name: "label-agent-runs-trigger",
    skillsDir: dirname(dirname(fileURLToPath(import.meta.url))),
    prompts: [
      "прогоны закончились, теперь надо разметить исходы каждого запуска агента",
      "the auto-classifier missed outcomes where the agent handed the decision back without asking a question",
      "нужен второй разметчик на другой модели и каппа Коэна по меткам прогонов",
      "we already ran the analysis, can I still fix a few run labels and how do I record it",
    ],
    irrelevantPrompts: [
      ...GRID.slice(0, 2),
      "make me a page to label these, and put the answers back into the study folder",
      "нужны парные прогоны, доверительные интервалы и поправка на множественные сравнения",
    ],
    fired: (trace) => skillResolved(trace, `${LOOSE_NS}:label-agent-runs`),
    // Four named phrasings per side, deliberately, as for every skill of this package.
    minPrompts: 4,
    // Finished runs and a first label file, so "label the runs" has runs to refer to.
    fixture: {
      "runs/a1/done.json": '{"status":"complete"}\n',
      "runs/a1/final-message.txt":
        "I'll leave the final call on this to you.\n",
      "labels.tsv": "agent\tmodel\tcell\tlabel\n",
    },
  },
});
