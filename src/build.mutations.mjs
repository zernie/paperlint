/**
 * Battery for `build.ts` — the module that decides WHAT a paper is built with.
 *
 * Set up together with the module itself and at the request of the mutation gate, which
 * refused to accept a harness that nothing could kill: a green harness by itself does not tell
 * "the check passed" apart from "the check cannot fail". The `--dry-run` case reintroduces a
 * defect the module REALLY had in its first version, one that overwrote `paper.pdf` in the
 * working tree — i.e. without this assertion the regression would have been silent and
 * destructive.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "build.ts");
const HARNESS = join(HERE, "build.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "`--dry-run` is swallowed silently again",
        harness: HARNESS,
        expect: "--dry-run: the script was NOT RUN — no trace on disk",
        disables:
          "the one half that cannot be checked from the returned object. The real defect: the " +
          "flag was parsed in the CLI and passed down here, where it did not exist — " +
          "destructuring the options SILENTLY swallows an unknown key. The dry run ran to " +
          "completion like a full build and overwrote paper.pdf in the working tree, and " +
          "pdflatex's output on screen is easy to mistake for a verbose dry-run",
        // 🔴 THE MUTATION KEEPS THE SHAPE OF THE RESPONSE AND BREAKS ONLY THE EFFECT. The obvious
        // move — drop the branch entirely — kills the neighboring assertion (status and the `dry`
        // flag) and never reaches the "no trace on disk" check at all, because assert aborts at
        // the first failure. The disk assertion would then stay decorative: nothing could kill
        // it, yet it would look tested. Here the dry run honestly returns a dry response while
        // ALSO RUNNING the script — exactly the defect the module actually had.
        edits: [
          [
            SRC,
            '  if (dryRun)\n    return { dir, status: "built", script: found.rel, code: 0, dry: true };\n',
            '  if (dryRun) {\n    const [db, dpre] = interpreterFor(found.path);\n    run(db, [...dpre, found.path], { stdio: "inherit" });\n    return { dir, status: "built", script: found.rel, code: 0, dry: true };\n  }\n',
          ],
        ],
      },
      {
        name: "the candidate order is swapped",
        harness: HARNESS,
        expect: "order matters: with both present, build.sh wins",
        disables:
          "the priority decision. `build.sh` comes first not alphabetically but because it is " +
          "what the author sees on opening the directory; silently falling through to repro/ " +
          "would build the wrong artifact and say nothing about it",
        edits: [
          [
            SRC,
            'export const BUILD_SCRIPTS = ["build.sh", "repro/build-submission.sh"];',
            'export const BUILD_SCRIPTS = ["repro/build-submission.sh", "build.sh"];',
          ],
        ],
      },
      {
        name: "the interpreter for .py stops being chosen",
        harness: HARNESS,
        expect: "python",
        disables:
          "choosing the interpreter by extension. It is done by extension rather than the " +
          "executable bit precisely so a fresh clone without +x does not fail with " +
          '"Permission denied" for a reason that has nothing to do with the paper',
        edits: [[SRC, '  if (ext === ".py") return ["python3", []];\n', ""]],
      },
      {
        name: "a missing script stops being its own status",
        harness: HARNESS,
        expect: "a paper with no script — status no-script",
        disables:
          "exactly the question this command was written to answer: which paper has no build " +
          "script at all. The corpus was answering it with silence — two papers out of four " +
          "turned out to have none, and the first dry run is what found that out",
        edits: [
          [
            SRC,
            'if (!found) return { dir, status: "no-script" };',
            'if (!found) return { dir, status: "built" };',
          ],
        ],
      },
      {
        name: "a nonzero exit code stops reading as a failure",
        harness: HARNESS,
        expect: "nonzero — failed, and the code is NAMED",
        disables:
          "the distinction between built and failed. A build that reports success while " +
          "pdflatex went red is a paper that gets submitted unbuilt",
        edits: [
          [SRC, 'status: code === 0 ? "built" : "failed",', 'status: "built",'],
        ],
      },
    ],
  }),
);
