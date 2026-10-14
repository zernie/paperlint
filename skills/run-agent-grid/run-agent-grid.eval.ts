/**
 * run-agent-grid — the PAID tier: does this skill's description fire on its own requests, and
 * stay quiet on a sibling's?
 *
 * Declared here, whole: the prompts it must fire on, the prompts it must not, and the
 * measurement — no shared table, no kit. `vigiles eval` discovers this file by its name and runs
 * it; nothing runs at import.
 *
 * The should-not-fire prompts are the neighbours' territory, written inline: `build-benchmark`
 * (designing the study), `build-label-page` (a page a person labels on), `label-agent-runs`
 * (labelling the outcomes) and `draft-paper`. They are inline rather than imported from
 * `label-agent-runs.eval.ts` because that file imports this one's prompts, and two evals that
 * import each other's constants deadlock at module load.
 *
 * The skills it competes with are every skill this package ships (the `skills/` directory this
 * file sits in), the same set in a checkout and in `node_modules`.
 *
 * ⚠️ NEVER RUN. Written with the skill; its rates are UNKNOWN, not assumed good.
 *
 * Costs money; not CI.
 *   npx vigiles eval skills/run-agent-grid/run-agent-grid.eval.ts
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineEval, skillResolved } from "vigiles";

/** The namespace vigiles installs a loose skills directory under. */
const LOOSE_NS = "vigiles-loose-skills";

/** Requests this skill owns. Exported: `label-agent-runs.eval.ts` uses them as its should-not-fire set. */
export const TRIGGER_PROMPTS: readonly string[] = [
  "запускаю платную сетку прогонов агента — что проверить до первого запуска",
  "the grid driver died halfway, how do I resume without re-running the counted cells",
  "два драйвера писали в одну рабочую папку, какие прогоны теперь испорчены",
  "gate every agent run on the approved sample and a hard budget cap before we spend money",
];

export default defineEval({
  measureTriggerRate: {
    name: "run-agent-grid-trigger",
    skillsDir: dirname(dirname(fileURLToPath(import.meta.url))),
    prompts: TRIGGER_PROMPTS,
    irrelevantPrompts: [
      "надо спроектировать сам замер, а не описывать его — как считать честно",
      "build a gold-labelling page for these 40 items so I can answer on my phone",
      "which of the finished runs does a person have to read, and which can the classifier label",
      "числа есть, пора писать текст",
    ],
    fired: (trace) => skillResolved(trace, `${LOOSE_NS}:run-agent-grid`),
    // Four named phrasings per side, deliberately, as for every skill of this package.
    minPrompts: 4,
    // A grid in progress, so "the driver died" and "the registry" have something to refer to.
    fixture: {
      "grid.json": '{ "arms": ["control", "treatment"], "seeds": [1, 2] }\n',
      "attempts.jsonl":
        '{"attempt":"a1","unit":"u1","arm":"control","seed":1,"start":"2026-01-01T00:00:00Z"}\n',
    },
  },
});
