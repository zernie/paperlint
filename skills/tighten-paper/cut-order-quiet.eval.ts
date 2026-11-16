/**
 * tighten-paper, the QUIET half of #486 — the same paper as `cut-order-loud.eval.ts`, with a Threats
 * section already down to one clause per limitation (`cut-order.fixture.ts`). Over several trials the
 * plan proposes no cut of Threats: KEEP the item, SHORTEN the prose, and here there is no prose left.
 *
 * Not yet run: estimated about $0.5–1.5 a trial on sonnet, about $2–5 for 3 trials. Not CI.
 *   npx vigiles eval skills/tighten-paper/cut-order-quiet.eval.ts
 */
import { assertRates, defineEval } from "vigiles";
import {
  COMMON,
  PLUGIN_DIR,
  TASK,
  check,
  fixture,
  makePlugin,
  planLines,
  takesFromThreats,
} from "./cut-order.fixture.ts";

export default defineEval<"measure">({
  assert: (report) => {
    assertRates(report, { min: 1 });
  },
  skipIf: makePlugin,
  measure: {
    pluginDir: PLUGIN_DIR,
    fixture: fixture("quiet"),
    task: TASK,
    allowedTools: ["Read", "Write", "Grep", "Glob", "Agent"],
    trials: 3,
    timeoutMs: 10 * 60_000,
    checks: [
      ...COMMON,
      check(
        "no-threats-cut",
        (ctx) => !planLines(ctx).some(takesFromThreats),
        "no plan line proposes shortening the Threats section",
      ),
    ],
  },
});
