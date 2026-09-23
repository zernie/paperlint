/**
 * skill-trigger-cases.mutations.mjs — the non-vacuity proof for the carrier harness.
 *
 * Run: `node lib/skill-trigger-cases.mutations.mjs`
 *
 * Every case here removes ONE property the harness claims to hold and requires the harness to
 * name that property rather than merely go red. Written with the carrier, not after it: a harness
 * whose success state is a single printed line cannot be observed working, and this package's own
 * `scripts/run-mutations.mjs` refuses a harness no battery can kill for exactly that reason.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMutations } from "./mutation-driver.mjs";
import { consumerRoot } from "../skills/paper-pipeline/scripts/consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "skill-trigger-cases.mjs");
const HARNESS = join(HERE, "skill-trigger-cases.harness.mjs");

const MUTATIONS = [
  [
    "a typoed declaration falls back to the default instead of throwing",
    [
      [
        SRC,
        'if (declared === undefined && e?.code === "ERR_MODULE_NOT_FOUND") return [];',
        'if (e?.code === "ERR_MODULE_NOT_FOUND") return [];',
      ],
    ],
    "a typoed declaration loaded quietly",
    "the undeclared/declared distinction — a mistyped path becomes a silently halved corpus",
  ],
  [
    "the consumer may shadow a case this package owns",
    [[SRC, "if (mine.has(c.skill))", "if (false && mine.has(c.skill))"]],
    "a shadowing case was accepted",
    "the one-truth rule: two tables answer «what should fire here» and the package's keeps looking authoritative",
  ],
  [
    "the consumer's cases are dropped entirely",
    [
      [
        SRC,
        "export const CASES = [...PACKAGE_CASES, ...(await consumerCases())];",
        "export const CASES = [...PACKAGE_CASES];",
      ],
    ],
    "the file at the default location was not merged",
    "the merge itself — every consumer measures precision against the package's skills alone",
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
