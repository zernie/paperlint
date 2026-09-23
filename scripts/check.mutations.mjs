/**
 * Battery for `npm run check` — and the thing under test is NOT "does it run eleven scripts".
 * That part is visible: you watch it happen. What is invisible, and therefore what this kills,
 * is whether the harness beside it can still tell when the gate list has fallen behind CI.
 *
 * 🔴 The failure mode this whole file exists against, measured 2026-09-19: a list of gates kept
 * by hand becomes a fossil the day after it is written. `check.harness.mjs` is the mechanism that
 * stops that — it reads job names out of the workflow rather than trusting a copy — and its
 * success state is silence. "It passed" and "it cannot fail" look identical from outside.
 *
 * Each case removes ONE property and names the assertion that must notice.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CHECK = join(HERE, "check.mjs");
const HARNESS = join(HERE, "check.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "a CI job stops being accounted for — the tail goes quiet about its own boundary",
        harness: HARNESS,
        // No job name here: the harness reads every workflow in directory order, so which job
        // fails first depends on file names, not on what this mutation proves.
        expect:
          "is either reproduced by a gate or named in NOT_COVERED with a reason",
        disables:
          "the reason this command is not just a shell alias. Emptying NOT_COVERED removes the " +
          "one sentence that tells a reader what the green does NOT mean — and a check silent " +
          "about its boundary reads as complete, which is the counter-that-counts-what-it-ignores " +
          "class this repository keeps re-finding",
        edits: [
          [
            CHECK,
            "export const NOT_COVERED = {",
            "export const NOT_COVERED = { }; const _unused = {",
          ],
        ],
      },
      {
        name: "a gate names a CI job that does not exist — coverage on paper, none in fact",
        harness: HARNESS,
        expect: "names a job that really exists in a workflow",
        disables:
          "the link between the list and the workflow. A dead job name is WORSE than a missing " +
          "one: it reads as coverage and delivers nothing, and nothing else in the repository " +
          "would ever contradict it",
        // 🔴 The anchor is a gate whose job is ALSO claimed by other gates (`gates`), and that
        // is not incidental. Renaming a solely-claimed job — `build-e2e` — kills the FIRST
        // assertion instead, because that job becomes uncovered before anyone asks whether the
        // new name exists. Measured: the driver reported "RED but a DIFFERENT case". Two
        // assertions overlapping is fine; a battery that cannot tell them apart is not.
        edits: [
          [
            CHECK,
            'name: "skills lint",\n    job: "gates",',
            'name: "skills lint",\n    job: "gates-renamed-in-ci",',
          ],
        ],
      },
      {
        name: "a gate points at a script nobody can run",
        harness: HARNESS,
        expect: "maps to a script that exists",
        disables:
          "the guarantee that every listed gate is runnable. A renamed script fails at the exact " +
          "moment someone is trusting the list — which is the worst possible moment to find out",
        edits: [
          [
            CHECK,
            'script: "check:marketplace"',
            'script: "check:marketplace-renamed"',
          ],
        ],
      },
      {
        name: "a gate drops out of CI silently, with no reason given",
        harness: HARNESS,
        expect: "carries a reason",
        disables:
          "the cost of removing something from CI. Without this, `job: null` is the quiet way to " +
          "take a check out of the pipeline: the local run still shows it green and nothing says " +
          "it stopped being enforced anywhere else",
        edits: [
          [
            CHECK,
            'reason:\n      "source-only property',
            'reasonRemoved:\n      "source-only property',
          ],
        ],
      },
    ],
  }),
);
