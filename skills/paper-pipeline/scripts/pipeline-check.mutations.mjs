/**
 * pipeline-check.mutations.mjs — plant the defect `pipeline-check.harness.mjs` claims to catch, and require it to die.
 *
 * Run: `node skills/paper-pipeline/scripts/pipeline-check.mutations.mjs` (it rewrites the source and restores
 * it, so it is not part of the plain test run).
 *
 * WHY IT EXISTS. A harness whose success state is silence cannot be observed working: «it passed»
 * and «it cannot fail» produce identical output. Written 2026-09-12, when the mechanism moved into
 * this package and `scripts/run-mutations.mjs` reported this harness as one nothing could kill.
 *
 * ⚠️ HONEST SCOPE: ONE case. It kills the checker outright — the shape that makes every other
 * assertion in the harness vacuous at once — and that is the property worth holding first, not the
 * only one worth holding. Narrower cases were probed and left out DELIBERATELY: the assertions
 * they trip carry no message of their own (a bare deepEqual diff), so `expect` could only match
 * text any unrelated failure also prints, and a case killed by someone else's assertion is not
 * evidence about its own defect. Adding one means giving that assertion a message first.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMutations } from "../../../lib/mutation-driver.mjs";
import { consumerRoot } from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "pipeline-check.mjs");
const HARNESS = join(HERE, "pipeline-check.harness.mjs");

const MUTATIONS = [
  [
    "check() goes blind",
    [
      [
        SRC,
        "export function check({ sections, header }, { sourceDate, today, dir }) {",
        "export function check({ sections, header }, { sourceDate, today, dir }) {\n  if (1) return [];",
      ],
    ],
    "stale-continuous: wrong finding set",
    "every gate-staleness finding: a PIPELINE-STATUS that reports nothing reads as a clean one",
  ],
];

process.exit(
  runMutations({
    root: consumerRoot(),
    runner: "vigiles",
    cases: MUTATIONS.map(([name, edits, expect, disables]) => ({ name, disables, edits, harness: HARNESS, expect })),
  }),
);
