/**
 * Battery for `latex-loop.ts` — the decision of the LaTeX build loop.
 *
 * Each case breaks one branch of `nextStep` and names the table row that must go red. The loop is
 * pure, so a surviving mutation here is a branch nobody tested, not a flaky environment.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "latex-loop.ts");
const HARNESS = join(HERE, "latex-loop.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the pass cap is removed",
        harness: HARNESS,
        expect: "after the cap, a still-moving aux is a FAIL",
        disables:
          "the stop on a document that never settles. Without it the loop runs forever; with a " +
          "silent cap it ships a PDF with stale cross-references",
        edits: [
          [
            SRC,
            "    if (latexRuns.length >= MAX_PASSES)",
            "    if (latexRuns.length >= MAX_PASSES && false)",
          ],
        ],
      },
      {
        name: "convergence ends the build without the final pass",
        harness: HARNESS,
        expect: "converged, so the FINAL pass",
        disables:
          "the \\finalpass run that arms paper-guards.tex. Skipping it saves one pdflatex run and " +
          "turns every undefined \\ref and \\cite back into a green build",
        edits: [
          [
            SRC,
            '  return { kind: "latex", final: true };\n}',
            '  return { kind: "done", warnings: [] };\n}',
          ],
        ],
      },
      {
        name: "a non-zero exit code is ignored",
        harness: HARNESS,
        expect: "a pdflatex pass exited non-zero — fail",
        disables:
          "failing on a failed pass. -halt-on-error stops pdflatex at the first error; a loop that " +
          "reads the half-written aux as progress would rerun it or call it converged",
        edits: [
          [
            SRC,
            "  if (last.exitCode !== 0)\n",
            "  if (last.exitCode !== 0 && false)\n",
          ],
        ],
      },
      {
        name: "a failing FINAL pass reads as done",
        harness: HARNESS,
        expect: "the FINAL pass exited non-zero",
        disables:
          "the only moment paper-guards can speak. Its error comes on the final pass, so a check " +
          "order that tests 'final' before 'exit code' would ship the undefined reference green",
        edits: [
          [
            SRC,
            "  if (last.exitCode !== 0)\n",
            '  if (last.exitCode !== 0 && !(last.step === "latex" && last.final))\n',
          ],
        ],
      },
      {
        name: "bibtex reruns only on a changed citation set, not on a changed .bib",
        harness: HARNESS,
        expect: "the .bib content changed since bibtex ran",
        disables:
          "the .bib hash as an input. A corrected author name or year in refs.bib would keep the " +
          "old .bbl, and the PDF would print the entry as it was before the fix",
        edits: [
          [
            SRC,
            "  JSON.stringify(a) === JSON.stringify(b);",
            '  JSON.stringify(a.kind === "needed" ? a.citations : []) ===\n  JSON.stringify(b.kind === "needed" ? b.citations : []);',
          ],
        ],
      },
      {
        name: "rerun markers stop counting",
        harness: HARNESS,
        expect: "marker: Rerun to get",
        disables:
          "the log's own request for another pass. Hashes catch most of it, but a package that " +
          "writes its state outside the tracked files (longtable widths, hyperref outlines) " +
          "speaks only through this line",
        edits: [
          [
            SRC,
            'const RERUN: readonly LogMarker[] = [\n  "rerun-requested",\n  "labels-changed",\n  "rerunfilecheck",\n];',
            "const RERUN: readonly LogMarker[] = [];",
          ],
        ],
      },
      {
        name: "undefined references become a rerun reason",
        harness: HARNESS,
        expect: "undefined references ALONE do not request a rerun",
        disables:
          "the difference between 'not settled yet' and 'this key does not exist'. On stable files " +
          "an undefined reference never resolves, so treating it as a rerun burns the cap and " +
          "reports no-convergence for what is really a typo",
        edits: [
          [
            SRC,
            '  "rerunfilecheck",\n];',
            '  "rerunfilecheck",\n  "undefined-references",\n];',
          ],
        ],
      },
      {
        name: "every bibtex run forces another pass",
        harness: HARNESS,
        expect: "bibtex left the .bbl byte-identical",
        disables:
          "reading bibtex's effect from the .bbl. A byte-identical .bbl changes nothing the next " +
          "pass would read",
        edits: [
          [
            SRC,
            '    if (files.length > 0) return { kind: "changed", files };\n',
            '    if (files.length > 0) return { kind: "changed", files };\n    if (o.step === "bibtex") return { kind: "changed", files: ["bbl"] };\n',
          ],
        ],
      },
    ],
  }),
);
