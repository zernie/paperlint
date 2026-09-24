/**
 * Battery for `balance.ts` — the decision of the balance step.
 *
 * Each case puts back a mistake this step is written against — most of them measured on the paper
 * the publisher returned — and names the table row that must go red. The module is pure, so a
 * survivor here is a row nobody wrote, not a flaky environment.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "balance.ts");
const HARNESS = join(HERE, "balance.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "balance.sty's second-column warning is ignored",
        harness: HARNESS,
        expect: "ran in the second column — rejected",
        disables:
          "the package's own statement that \\balance was misplaced. On the real paper position 0 " +
          "came out balanced by way of the page before; accepting it takes luck for a placement",
        edits: [[SRC, '  if (a.secondColumn) return "second-column";\n', ""]],
      },
      {
        name: "a moved page count is accepted",
        harness: HARNESS,
        expect: "the page count moved",
        disables:
          "the only check that sees upstream damage. The measurement looks at the last page alone",
        edits: [[SRC, '  if (a.pages !== base.pages) return "pages";\n', ""]],
      },
      {
        name: "overfull boxes are not checked at all",
        harness: HARNESS,
        expect: "the position-8 case",
        disables:
          "the reason the scan exists instead of taking the first balanced page: position 8 of the " +
          "real paper balanced it and broke the layout",
        edits: [
          [SRC, '  if (a.overfull > base.overfull) return "overfull";\n', ""],
        ],
      },
      {
        name: "overfull boxes are compared with zero, not with the unbalanced build",
        harness: HARNESS,
        expect: "ALREADY had is not this step's to reject",
        disables:
          "attributing a defect to the step that made it. A paper whose body already has an " +
          "overfull hbox would fail here, at every position, for something balancing did not do",
        edits: [
          [
            SRC,
            '  if (a.overfull > base.overfull) return "overfull";',
            '  if (a.overfull > 0) return "overfull";',
          ],
        ],
      },
      {
        name: "balance.sty's 1.5 pt vbox counts as broken layout",
        harness: HARNESS,
        expect: "balance.sty's own 1.503 pt vbox does not",
        disables:
          "the vbox tolerance. Every balanced page carries that box, so without it no position " +
          "is ever acceptable and every ACM build fails",
        edits: [
          [
            SRC,
            '  b.box === "hbox" || b.pt >= VBOX_TOLERANCE_PT;',
            '  b.box === "hbox" || b.pt >= 0;',
          ],
        ],
      },
      {
        name: "the gap AT the tolerance reads as unbalanced",
        harness: HARNESS,
        expect: "exactly at the tolerance is balanced",
        disables:
          "agreement with the CI rule, which accepts a gap equal to the tolerance",
        edits: [[SRC, "  columnGap(c) <= tol;", "  columnGap(c) < tol;"]],
      },
      {
        name: "the step's tolerance drifts from the venue profiles",
        harness: HARNESS,
        expect: "BALANCE_TOL_PT equals every venue profile",
        disables:
          "one number for one judgement. A build that accepts what the CI rule then rejects (or " +
          "the reverse) is two truths about the same PDF",
        edits: [
          [
            SRC,
            "export const BALANCE_TOL_PT = 120;",
            "export const BALANCE_TOL_PT = 100;",
          ],
        ],
      },
      {
        name: "the scan does not stop at the first acceptable position",
        harness: HARNESS,
        expect: "chosen, and the scan STOPS",
        disables:
          "the stop. Each extra position is two more pdflatex passes, and the PDF on disk would " +
          "be the last one tried, not the one chosen",
        edits: [
          [
            SRC,
            '  if (chosen !== null) return { kind: "chosen", position: chosen };',
            '  if (chosen !== null && false) return { kind: "chosen", position: chosen };',
          ],
        ],
      },
      {
        name: "a hand-picked lower bound is put back",
        harness: HARNESS,
        expect: "no hand-picked lower bound",
        disables:
          "deriving the range from the .bbl. The script this replaced started at 5 for no measured " +
          "reason; positions 0–19 gave the same page",
        edits: [
          [
            SRC,
            "  return Array.from({ length: Math.max(0, count) }, (_, i) => i);",
            "  return Array.from({ length: Math.max(0, count) }, (_, i) => i).filter((i) => i >= 1);",
          ],
        ],
      },
      {
        name: "\\balance is not inserted",
        harness: HARNESS,
        expect: "on its own line just before the chosen",
        disables: "the insertion itself",
        edits: [
          [
            SRC,
            "  return bbl.slice(0, at) + BALANCE_LINE + bbl.slice(at);",
            "  return bbl.slice(0, at) + bbl.slice(at);",
          ],
        ],
      },
      {
        name: "\\bibitem's are found by text search, not by the parser",
        harness: HARNESS,
        expect: "the one in a comment not counted",
        disables:
          "the parser. A text search counts a \\bibitem in a comment, and every position after it " +
          "lands one entry early",
        edits: [
          [
            SRC,
            "  const ast = getParser().parse(bbl);\n",
            "  return [...bbl.matchAll(/\\\\bibitem/g)].map((m) => m.index);\n  const ast = getParser().parse(bbl);\n",
          ],
        ],
      },
      {
        name: "the FIRST page is read as the last",
        harness: HARNESS,
        expect: "the last page: the count of pages",
        disables: "measuring the page that has to be balanced",
        edits: [
          [SRC, "  const last = pages.at(-1);", "  const last = pages.at(0);"],
        ],
      },
      {
        name: "the last format option does not win",
        harness: HARNESS,
        expect: "the LAST format wins",
        disables:
          "reading the options the way the class applies them, in order",
        edits: [
          [
            SRC,
            "    } else if ((ACMART_FORMATS as readonly string[]).includes(key))\n      format = key;",
            "    } else if (\n      (ACMART_FORMATS as readonly string[]).includes(key) &&\n      format === ACMART_DEFAULT_FORMAT\n    )\n      format = key;",
          ],
        ],
      },
      {
        name: "a one-column format is balanced",
        harness: HARNESS,
        expect: "acmart with no format is manuscript",
        disables:
          "the class's own list of two-column formats. A one-column paper has no second column",
        edits: [
          [
            SRC,
            "  if (!ACMART_TWO_COLUMN_FORMATS.includes(format))",
            "  if (false)",
          ],
        ],
      },
      {
        name: "a review build is balanced",
        harness: HARNESS,
        expect: "review numbers the lines — skipped",
        disables:
          "the skip for numbered lines, which make both columns measure full height — nothing " +
          "to balance, and nothing the publisher asks of a review copy",
        edits: [[SRC, '  if (optionOn(dc.options, "review"))', "  if (false)"]],
      },
      {
        name: "a paper with no bibliography is balanced",
        harness: HARNESS,
        expect: "no bibliography — skipped",
        disables:
          "the precondition: \\balance goes into the .bbl, and without a bibliography there is none",
        edits: [[SRC, "  if (!facts.bibliography)", "  if (false)"]],
      },
      {
        name: "the near miss is the WORST attempt",
        harness: HARNESS,
        expect: "the near miss is the smallest gap",
        disables:
          "the number the author acts on after a failed scan: how close the best position came",
        edits: [
          [
            SRC,
            "columnGap(a.columns) < columnGap(best.columns)",
            "columnGap(a.columns) > columnGap(best.columns)",
          ],
        ],
      },
      {
        name: "the body-text hint is printed on every failure",
        harness: HARNESS,
        expect: "belongs in the body text",
        disables:
          "a hint that is only true when every position fell in the second column; printed " +
          "always, it sends the author to edit the body when the bibliography was the problem",
        edits: [
          [
            SRC,
            '  if (by.get("second-column")?.length === attempts.length)',
            "  if (true)",
          ],
        ],
      },
    ],
  }),
);
