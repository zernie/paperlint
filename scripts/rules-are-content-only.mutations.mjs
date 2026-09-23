/**
 * Battery for the "rule does not touch git" gate, `scripts/rules-are-content-only.mjs`.
 *
 * 🔴 This battery needs to be sharper than the rule. Its success state is an EMPTY LIST, which is
 * exactly the state it teaches not to trust. A check seen only silent is indistinguishable from
 * one that never looks.
 *
 * BOTH DIRECTIONS, and they must die on DIFFERENT assertions:
 *   - `undercatch` — stops finding anything. The "quiet on clean" half stays green;
 *     the "fires" half must fail.
 *   - `overcatch` — calls any spawner a finding. The "fires" half stays green
 *     (it still sees `git`), the "quiet on clean" half must fail. MEASURED: it breaks on
 *     LIVE CORPUS (6 findings in the package's own rules) before a planted fixture with
 *     `texcount` — and that is stronger, not weaker: real data.
 * A battery where both mutations die on one assertion proves ONE half exists.
 *
 * ⚠️ The second mutation reproduces a REAL false positive: the first version of the check
 * was keyed on the `child_process` import and in the first hour called `paper-texcount.mjs`
 * a finding in the consumer — it calls `texcount` to count words. On an `error` gate this is
 * worse than a miss: a gate you cannot pass gets turned off. The mutation holds this line.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const GUARD = join(HERE, "rules-are-content-only.mjs");
const HARNESS = join(HERE, "rules-are-content-only.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "undercatch — check stops finding",
        harness: HARNESS,
        expect: "FIRES on execFileSync with a git argv",
        disables:
          "the verdict itself: the check becomes that very confident green zero it was written " +
          "to spot — it scans, counts files and renders no judgment",
        edits: [
          [
            GUARD,
            "if (SPAWNERS.has(String(name)) && isGit(n.arguments?.[0]?.value))",
            "if (false && SPAWNERS.has(String(name)) && isGit(n.arguments?.[0]?.value))",
          ],
        ],
      },
      {
        name: "overcatch — any spawner call becomes a finding",
        harness: HARNESS,
        // Fails on LIVE CORPUS, not on the texcount fixture, and this is measured: under this mutation
        // the package's own rules yield 6 findings, meaning the "quiet on clean" half breaks
        // before we reach the planted case. Live signal is stronger than fixture — it is real data — so
        // it is named, not the one I expected to see.
        expect: "quiet on the real corpus",
        disables:
          "the boundary of the predicate 'calls git' vs 'spawns a process' — the one that was " +
          "set after the texcount false positive in the consumer",
        edits: [
          [
            GUARD,
            "if (SPAWNERS.has(String(name)) && isGit(n.arguments?.[0]?.value))",
            "if (SPAWNERS.has(String(name)))",
          ],
        ],
      },
      {
        name: "guard for empty scan stops failing",
        harness: HARNESS,
        expect: "scanned something",
        disables:
          "the answer to 'did you even look': zero found sources become silent success again, " +
          "indistinguishable from a clean run",
        edits: [[GUARD, 'f.endsWith(".mjs") &&', "false &&"]],
      },
    ],
  }),
);
