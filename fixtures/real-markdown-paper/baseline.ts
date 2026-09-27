/**
 * ONE reader of `baseline.json`, shared by the two runs that compare against it: the harness
 * beside this file (the repository's own `bin/paperlint.mjs`) and `test/e2e/install.mjs` (the binary
 * a consumer actually got). Two copies of "growth fails, a drop never does" would drift the first
 * time one of them is tightened, and the two runs would then disagree about the same article.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Findings per rule id. */
export type Counts = Record<string, number>;

const Baseline = z.object({ findings: z.record(z.string(), z.number()) });
const LintOutput = z.array(
  z.object({
    messages: z.array(z.object({ ruleId: z.string().nullable() })).nullish(),
  }),
);

const HERE = dirname(fileURLToPath(import.meta.url));

/** The recorded counts, `{ruleId: n}`. */
export function recordedFindings(): Counts {
  return Baseline.parse(
    JSON.parse(readFileSync(join(HERE, "baseline.json"), "utf8")),
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
 * A partial drop is neither: it is what a fix looks like (paperlint#44 is expected to take typography
 * to zero, and then the recording is updated in the same change).
 */
export function compareToBaseline(
  found: Readonly<Counts>,
  recorded: Readonly<Counts> = recordedFindings(),
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
