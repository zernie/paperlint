/**
 * Battery for `latex-log.ts` — reading pdflatex logs, bibtex output and `.aux` files.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "latex-log.ts");
const HARNESS = join(HERE, "latex-log.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the 79-column wrap is not undone",
        harness: HARNESS,
        expect: "a marker broken at column 79 is rejoined and found",
        disables:
          "rejoining the lines TeX broke. A 'Rerun to get' split across the break is then on no " +
          "line at all, and the loop stops one pass early",
        edits: [
          [
            SRC,
            "    if (line.length === MAX_PRINT_LINE) {",
            "    if (line.length === MAX_PRINT_LINE && false) {",
          ],
        ],
      },
      {
        name: "the -file-line-error spelling is not an error line",
        harness: HARNESS,
        expect: "-file-line-error form",
        disables:
          "the spelling rpp's own flags produce for most errors. With only the `!` form " +
          "recognised, an undefined control sequence fails with no error line quoted",
        edits: [
          [
            SRC,
            '  return m !== null && /[./]/.test(m[1] ?? "");',
            "  return false;",
          ],
        ],
      },
      {
        name: "any `word:NN: ` counts as an error line",
        harness: HARNESS,
        expect: "a path-less `word:12: ` is not an error line",
        disables:
          "the requirement that the prefix look like a path. Without it the first such line in a " +
          "package's info output is quoted as 'the error'",
        edits: [
          [
            SRC,
            '  return m !== null && /[./]/.test(m[1] ?? "");',
            "  return m !== null;",
          ],
        ],
      },
      {
        name: "the excerpt does not stop at the l.NNN context",
        harness: HARNESS,
        expect: "the excerpt stops at the context",
        disables:
          "the end of the excerpt. It then runs into TeX's memory statistics, and the line the " +
          "author needs is buried in lines nobody reads",
        edits: [[SRC, "      break;\n", ""]],
      },
      {
        name: "\\@input aux files are not followed",
        harness: HARNESS,
        expect:
          "citations: sorted, unique, including the ones in an \\@input aux",
        disables:
          "citations from \\include'd chapters. A \\cite added in a chapter would not change the " +
          "citation set, and bibtex would not rerun for it",
        edits: [
          [
            SRC,
            "  const nested = walk.readInput(input);",
            "  const nested = null;",
          ],
        ],
      },
      {
        name: "the bibtex banner is quoted as the explanation",
        harness: HARNESS,
        expect: "bibtex: the banner is dropped",
        disables:
          "filtering bibtex's fixed preamble. A failure would open with 'This is BibTeX, Version " +
          "0.99d' and push the real reason down",
        edits: [[SRC, "!BIBTEX_PREAMBLE.some((p) => l.startsWith(p))", "true"]],
      },
      {
        name: "one undefined reference reads as the end-of-run summary",
        harness: HARNESS,
        expect: "a single reference warning is not the end-of-run summary",
        disables:
          "matching the documented summary line rather than the word 'undefined'",
        edits: [
          [
            SRC,
            '    if (line.includes("There were undefined references"))',
            '    if (line.includes("undefined"))',
          ],
        ],
      },
      {
        name: "an overfull vbox is read as an hbox",
        harness: HARNESS,
        expect: "overfull: both kinds, with their sizes",
        disables:
          "telling the two apart. An hbox always breaks the layout and balance.sty's 1.5 pt vbox " +
          "never does, so reading one as the other rejects every balanced page",
        edits: [[SRC, 'box: m[1] === "h" ? "hbox" : "vbox"', 'box: "hbox"']],
      },
      {
        name: "an overfull line quoted mid-line counts as TeX's",
        harness: HARNESS,
        expect: "overfull: both kinds, with their sizes",
        disables:
          "the anchor: TeX starts the line with the message, and a quote of it elsewhere is not a box",
        edits: [[SRC, "/^Overfull \\\\([hv])box", "/Overfull \\\\([hv])box"]],
      },
      {
        name: "any package warning reads as balance.sty's second-column one",
        harness: HARNESS,
        expect: "…and a log without it is not",
        disables:
          "reading the one documented line. Every other warning would reject a good position",
        edits: [
          [
            SRC,
            '      "Package balance Warning: You have called \\\\balance in second column",',
            '      "Package",',
          ],
        ],
      },
    ],
  }),
);
