/**
 * ONE reader of `baseline.json`, shared by the two runs that compare against it: the harness
 * beside this file (the repository's own `bin/rpp.mjs`) and `scripts/install-e2e.mjs` (the binary
 * a consumer actually got). Two copies of "growth fails, a drop never does" would drift the first
 * time one of them is tightened, and the two runs would then disagree about the same article.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The recorded counts, `{ruleId: n}`. */
export function recordedFindings() {
  return JSON.parse(readFileSync(join(HERE, "baseline.json"), "utf8")).findings;
}

/**
 * `rpp lint --json` stdout → `{ruleId: n}`.
 * 🔴 Output that does not parse THROWS. An empty set read as "clean" is how this repository's
 * checks have gone hollow before.
 */
export function countByRule(stdout) {
  const out = {};
  for (const file of JSON.parse(stdout))
    for (const m of file.messages ?? [])
      out[m.ruleId] = (out[m.ruleId] ?? 0) + 1;
  return out;
}

/**
 * Compare measured counts with the recording.
 *   grew     — a rule says MORE about real prose than recorded: a false positive until shown
 *              otherwise. Always a failure.
 *   vanished — a recorded rule went fully quiet without the recording being updated: how a check
 *              dies unnoticed. Also a failure.
 * A partial drop is neither: it is what a fix looks like (rpp#44 is expected to take typography
 * to zero, and then the recording is updated in the same change).
 */
export function compareToBaseline(found, recorded = recordedFindings()) {
  const grew = Object.entries(found)
    .filter(([rule, n]) => n > (recorded[rule] ?? 0))
    .map(([rule, n]) => ({ rule, now: n, recorded: recorded[rule] ?? 0 }));
  const vanished = Object.keys(recorded).filter(
    (r) => recorded[r] > 0 && !(r in found),
  );
  return { grew, vanished };
}
