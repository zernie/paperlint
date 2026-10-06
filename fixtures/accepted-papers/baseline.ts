/**
 * ONE reader of `baseline.json`, shared by every run that compares against one:
 * `accepted-papers.test.ts` beside this file (one baseline per accepted paper, through the CLI's
 * own `run`) and `test/e2e/install/install.e2e.ts` (the binary a consumer actually got). Two copies
 * of "growth fails, a drop never does" would drift the first time one of them is tightened, and the
 * runs would then disagree about the same rules.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** Findings per rule id. */
export type Counts = Record<string, number>;

const Baseline = z.object({ findings: z.record(z.string(), z.number()) });
const LintOutput = z.array(
  z.object({
    messages: z.array(z.object({ ruleId: z.string().nullable() })).nullish(),
  }),
);

/** The counts recorded in `dir`'s `baseline.json`, `{ruleId: n}`. */
export function recordedFindings(dir: string): Counts {
  return Baseline.parse(
    JSON.parse(readFileSync(join(dir, "baseline.json"), "utf8")),
  ).findings;
}

/**
 * `paperlint lint --json` stdout → `{ruleId: n}`.
 * 🔴 Output that does not parse THROWS. An empty set read as "clean" is how this repository's
 * checks have gone hollow before.
 */
export function countByRule(stdout: string): Counts {
  const out: Counts = {};
  for (const file of LintOutput.parse(JSON.parse(stdout)))
    for (const m of file.messages ?? []) {
      const rule = String(m.ruleId);
      out[rule] = (out[rule] ?? 0) + 1;
    }
  return out;
}

/**
 * Compare measured counts with the recording.
 *   grew     — a rule says MORE about real prose than recorded: a false positive until shown
 *              otherwise. Always a failure.
 *   vanished — a recorded rule went fully quiet without the recording being updated: how a check
 *              dies unnoticed. Also a failure.
 * A partial drop is neither: it is what a fix looks like, and the recording is updated in the same
 * change.
 */
export function compareToBaseline(
  found: Readonly<Counts>,
  recorded: Readonly<Counts>,
): {
  grew: { rule: string; now: number; recorded: number }[];
  vanished: string[];
} {
  const grew = Object.entries(found)
    .filter(([rule, n]) => n > (recorded[rule] ?? 0))
    .map(([rule, n]) => ({ rule, now: n, recorded: recorded[rule] ?? 0 }));
  const vanished = Object.keys(recorded).filter(
    (r) => (recorded[r] ?? 0) > 0 && !(r in found),
  );
  return { grew, vanished };
}
