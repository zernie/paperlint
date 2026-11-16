/**
 * tighten-paper, the LOUD half of #486 — the PAID tier for what the skill does. A paper one page over
 * its limit, with a Threats section that spends a paragraph per limitation and five references cited
 * once in sentences that carry no claim (`cut-order.fixture.ts`). Over several trials:
 *
 *   - the plan takes words from Threats;
 *   - the plan names at least two of the once-cited references;
 *   - if it proposes cutting the outside-benchmark or base-rate result, that comes after both, and
 *     the plan carries the ledger of earlier kinds (body-vs-appendix.md, "When the body overruns").
 *
 * The quiet half is `cut-order-quiet.eval.ts`. Not yet run: estimated about $0.5–1.5 a trial on
 * sonnet (one read of a ~1,900-word paper plus the reference, possibly one persona subagent), so
 * about $2–5 for this file's 3 trials. Not CI.
 *   npx vigiles eval skills/tighten-paper/cut-order-loud.eval.ts
 */
import { assertRates, defineEval } from "vigiles";
import type { RunContext } from "vigiles/eval";
import {
  CHEAP_RESULTS,
  COMMON,
  ONCE_CITED,
  PLUGIN_DIR,
  TASK,
  check,
  fixture,
  makePlugin,
  planLines,
  takesFromThreats,
} from "./cut-order.fixture.ts";

/** The first plan line that satisfies `p`, or Infinity when none does. */
const firstLine = (ctx: RunContext, p: (line: string) => boolean): number => {
  const i = planLines(ctx).findIndex(p);
  return i === -1 ? Infinity : i;
};

const namesOnceCited = (line: string): boolean =>
  ONCE_CITED.some((k) => line.includes(k));
const cutsCheapResult = (line: string): boolean =>
  CHEAP_RESULTS.some((r) => line.includes(r)) &&
  /CUT|MOVE|drop|remove|FOLD/i.test(line);

export default defineEval<"measure">({
  assert: (report) => {
    assertRates(report, { min: 1 });
  },
  skipIf: makePlugin,
  measure: {
    pluginDir: PLUGIN_DIR,
    fixture: fixture("loud"),
    task: TASK,
    allowedTools: ["Read", "Write", "Grep", "Glob", "Agent"],
    trials: 3,
    timeoutMs: 10 * 60_000,
    checks: [
      ...COMMON,
      check(
        "takes-from-threats",
        (ctx) => planLines(ctx).some(takesFromThreats),
        "a plan line proposes shortening the Threats section",
      ),
      check(
        "names-once-cited",
        (ctx) =>
          ONCE_CITED.filter((k) => planLines(ctx).some((l) => l.includes(k)))
            .length >= 2,
        "the plan names at least two of the once-cited references",
      ),
      check(
        "results-last-with-ledger",
        (ctx) => {
          const result = firstLine(ctx, cutsCheapResult);
          return (
            result === Infinity ||
            (firstLine(ctx, takesFromThreats) < result &&
              firstLine(ctx, namesOnceCited) < result &&
              planLines(ctx).some((l) => /exhausted|ledger/i.test(l)))
          );
        },
        "a cut of the outside-benchmark or base-rate result, if any, comes after Threats and the once-cited references, with the ledger",
      ),
    ],
  },
});
