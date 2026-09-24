/**
 * Battery for `build-engine.ts` — `rpp build`'s engine step.
 *
 * Each case breaks one line and names the harness row that must go red. The harness runs its
 * tables in order, so a case dies at its own assertion, not at a later one that happens to depend
 * on it.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "build-engine.ts");
const HARNESS = join(HERE, "build-engine.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "Enter is not yes",
        harness: HARNESS,
        expect: 'isYes("") is true',
        disables: "the default answer: [Y/n] promises that Enter installs",
        edits: [
          [
            SRC,
            '  answer !== null && ["", "y", "yes"].includes(answer.trim().toLowerCase());',
            '  answer !== null && ["y", "yes"].includes(answer.trim().toLowerCase());',
          ],
        ],
      },
      {
        name: "the cache is not put on PATH",
        harness: HARNESS,
        expect: "a complete cache: used, named, and PATH starts with its bin",
        disables:
          "the cache being USED: without its bin first on PATH the build runs whatever pdflatex the machine has",
        edits: [
          [
            SRC,
            '  PATH: [bin, env["PATH"] ?? ""].join(delimiter),',
            '  PATH: env["PATH"],',
          ],
        ],
      },
      {
        name: "a run without a human is asked anyway",
        harness: HARNESS,
        expect: "🔴 no human, nothing qualifies",
        disables:
          "refusing without a terminal: CI and agents would block on a question nobody can answer",
        edits: [
          [
            SRC,
            "    interactive: o.interactive && !o.dryRun,",
            "    interactive: true,",
          ],
        ],
      },
      {
        name: "--dry-run acts on the decision",
        harness: HARNESS,
        expect: "--dry-run: prints what would stop the build",
        disables: "a plan without side effects",
        edits: [[SRC, "  if (o.dryRun) {", "  if (false) {"]],
      },
      {
        name: "the refusal does not name the command",
        harness: HARNESS,
        expect: "🔴 no human, nothing qualifies",
        disables:
          "the one line a CI log shows: without `npx rpp toolchain` in it, the reader does not know the cure",
        edits: [
          [
            SRC,
            "run \\`npx rpp toolchain\\` (missing:",
            "install TeX Live (missing:",
          ],
        ],
      },
    ],
  }),
);
