/**
 * provenance.mutations.mjs — plant each defect `provenance.harness.mjs` claims to catch, and require it to die.
 *
 * Run: `node skills/paper-pipeline/scripts/provenance.mutations.mjs` (~1 min; it rewrites the source and
 * restores it, so it is not part of the plain test run).
 *
 * WHY IT EXISTS. A harness whose success state is silence cannot be observed working: «it passed»
 * and «it cannot fail» produce identical output. This battery is the difference. It was written on
 * 2026-09-12, when the mechanism moved into this package and `scripts/run-mutations.mjs` reported
 * this harness as one nothing could kill — a gap that had been open for as long as the harness had
 * existed, invisible because nothing asked the question.
 *
 * Every replacement below differs from the text it replaces (the driver refuses a no-op, which
 * would leave a green harness proving nothing), every case names the assertion that must fire, and
 * the driver verifies the patch actually landed before believing a result.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMutations } from "../../../lib/mutation-driver.mjs";
import { consumerRoot } from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "check-provenance.mjs");
const HARNESS = join(HERE, "provenance.harness.mjs");

const MUTATIONS = [
  [
    "the scope gate is inverted",
    [
      [
        SRC,
        "if (!provenanceScope(dir).covered) return [];",
        "if (provenanceScope(dir).covered) return [];",
      ],
    ],
    "coverage measurement must always print",
    "the in-scope/out-of-scope distinction: covered papers stop being checked and the report still prints",
  ],
  [
    "the numbers gate is removed",
    [[SRC, "return [...checkNumbersGate(dir)];", "return [];"]],
    "coverage measurement must always print",
    "the only finding this checker can make — it becomes a script that always says clean",
  ],
];

process.exit(
  runMutations({
    root: consumerRoot(),
    runner: "vigiles",
    cases: MUTATIONS.map(([name, edits, expect, disables]) => ({
      name,
      disables,
      edits,
      harness: HARNESS,
      expect,
    })),
  }),
);
