/**
 * Battery for `latex-loop.ts` — the decision of the LaTeX build loop.
 *
 * Each case breaks one line of `nextStep` or `summarize` and names the table row that must go red:
 * a `nextStep` mutation dies in the State table, a `summarize` one in the history table. The loop
 * is pure, so a surviving mutation here is a branch nobody tested, not a flaky environment.
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
        expect: "Q3 cap:",
        disables:
          "the stop on a document that never settles. Without it the loop runs forever; with a " +
          "silent cap it ships a PDF with stale cross-references",
        edits: [
          [
            SRC,
            "  if (s.latexPasses < MAX_PASSES) return",
            "  if (true) return",
          ],
        ],
      },
      {
        name: "convergence ends the build without the final pass",
        harness: HARNESS,
        expect: "Q4 nothing unsettled",
        disables:
          "the \\finalpass run that arms paper-guards.tex. Skipping it saves one pdflatex run and " +
          "turns every undefined \\ref and \\cite back into a green build",
        edits: [
          [
            SRC,
            '  if (s.unsettled.length === 0) return { kind: "latex", final: true };',
            '  if (s.unsettled.length === 0) return { kind: "done", warnings: [] };',
          ],
        ],
      },
      {
        name: "a non-zero exit code is ignored",
        harness: HARNESS,
        expect: "summarize: a non-zero exit is `failed`",
        disables:
          "failing on a failed pass. -halt-on-error stops pdflatex at the first error; a loop that " +
          "reads the half-written aux as progress would rerun it or call it converged",
        edits: [
          [
            SRC,
            "      last && last.exitCode !== 0\n",
            "      last && last.exitCode !== 0 && false\n",
          ],
        ],
      },
      {
        name: "a failing FINAL pass reads as done",
        harness: HARNESS,
        expect: "Q1 the last program failed",
        disables:
          "the only moment paper-guards can speak. Its error comes on the final pass, so a check " +
          "order that tests 'final' before 'exit code' would ship the undefined reference green",
        edits: [
          [
            SRC,
            '  if (s.failed) return { kind: "fail", ...s.failed };\n  if (s.finalDone) return { kind: "done", warnings: s.warnings };\n',
            '  if (s.finalDone) return { kind: "done", warnings: s.warnings };\n  if (s.failed) return { kind: "fail", ...s.failed };\n',
          ],
        ],
      },
      {
        name: "bibtex reruns only on a changed citation set, not on a changed .bib",
        harness: HARNESS,
        expect: "summarize: the .bib content changed since bibtex ran",
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
        expect: "summarize: marker: Rerun to get",
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
        expect: "summarize: undefined references ALONE leave nothing unsettled",
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
        expect: "summarize: bibtex left the .bbl byte-identical",
        disables:
          "reading bibtex's effect from the .bbl. A byte-identical .bbl changes nothing the next " +
          "pass would read",
        edits: [
          [
            SRC,
            "    if (files.length > 0) return files.map((f) => `paper.${f}`);\n",
            '    if (files.length > 0) return files.map((f) => `paper.${f}`);\n    if (o.step === "bibtex") return ["paper.bbl"];\n',
          ],
        ],
      },
      {
        name: "the bibliography question is never asked",
        harness: HARNESS,
        expect: "Q2 the bibliography input moved",
        disables:
          "running bibtex at all. The first pass writes the \\citation list, and without this " +
          "question the loop reruns pdflatex without ever producing a .bbl, and every \\cite stays undefined",
        edits: [
          [
            SRC,
            '  if (s.bibOutdated) return { kind: "bibtex" };',
            '  if (false) return { kind: "bibtex" };',
          ],
        ],
      },
    ],
  }),
);
