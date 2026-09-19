/**
 * Battery for `structure.ts` — the package's only check whose subject is a file's ABSENCE.
 *
 * A check like this is especially vulnerable to silent failure: it reports on what is missing,
 * so a broken one looks exactly like a clean corpus. This battery exists because `test:sabotage`
 * refused to accept a harness that nothing could kill.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "structure.ts");
const HARNESS = join(HERE, "structure.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "generous detection is removed — any directory counts as a paper",
        harness: HARNESS,
        expect: "a directory WITHOUT a single pipeline marker is left alone entirely",
        disables:
          "the condition the check uses at all to decide it is looking at a paper. Without it, " +
          "findings would rain down on `data/`, `figures/` and any neighboring directory — and a " +
          "rule that yells at the innocent gets turned off entirely, real findings and all",
        edits: [
          [
            SRC,
            "      if (!rules.markers.some((m: string) => existsSync(join(dir, m)))) continue;",
            "      if (false) continue;",
          ],
        ],
      },
      {
        name: "`ignore` stops exempting",
        harness: HARNESS,
        expect: "`ignore` exempts a directory by name",
        disables:
          "the consumer's only way to say \"this directory is not a paper\". Without it, an " +
          "exemption has to be expressed by renaming the directory",
        edits: [
          [SRC, "      if (rules.ignore.includes(name)) continue;\n", ""],
        ],
      },
      {
        name: "the second accepted source form falls out of the defaults",
        harness: HARNESS,
        expect: "`paper.md` counts on equal footing with `paper.tex`",
        disables:
          "the second source form the live corpus keeps. A paper on `paper.md` would become a " +
          "\"no source\" finding while its source is right there — i.e. the check would yell at " +
          "the innocent, and such rules get turned off entirely, real findings and all",
        edits: [
          [SRC, 'requireOneOf: [["paper.tex", "paper.md"]]', 'requireOneOf: [["paper.tex"]]'],
        ],
      },
      {
        name: "the path in a finding goes absolute again",
        harness: HARNESS,
        expect: "and the path is RELATIVE",
        disables:
          "the readability of the finding. An absolute path to the run's temp directory tells " +
          "the reader nothing and on top of that makes the output useless for comparing across machines",
        edits: [
          [
            SRC,
            "  const say = (p: string): string => relative(cwd, p) || p;",
            "  const say = (p: string): string => p;",
          ],
        ],
      },
    ],
  }),
);
