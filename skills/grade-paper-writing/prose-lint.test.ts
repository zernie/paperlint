/**
 * prose-lint.mjs as a process — the way the skill runs it. Every mode, on an accepted paper and on
 * fixtures written here, with the WHOLE output compared: the report is the product, so a changed
 * number or a dropped line is a changed result.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../test/support.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "prose-lint.mjs");
/**
 * One process that loads the LaTeX parser and reads a full accepted paper: about 1 s alone, 5.6 s
 * measured under coverage with the suite running in parallel — past vitest's 5 s default.
 */
const SPAWN_LATEX_MS = 60_000;
/** An accepted paper whose bibliography sits inline in `filecontents`, beside a long preamble. */
const ACCEPTED = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "accepted-papers",
  "agenticdev-acm26",
  "paper.tex",
);
const root = useTempDir("prose-lint-");

const LONG_CAPTION_SENTENCE = Array.from(
  { length: 45 },
  (_, i) => `word${String(i)}`,
).join(" ");

/** A paper.tex whose body is `body`. */
const tex = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

writeTree(root, {
  "p/paper.tex": tex(
    "\\section{Introduction}\nIn this paper we present a linter. It might possibly help.",
  ),
  "p/figures/fig1.tex": `\\begin{figure}\\caption{\\textbf{Big.} ${LONG_CAPTION_SENTENCE}. ${"More words here. ".repeat(20)}}\\end{figure}`,
  // Empty once LaTeX commands and braces are stripped: skipped, not counted as a zero-word caption.
  "p/figures/fig2.tex": "\\caption{\\centering}",
  // A lone "#": no word at all — measured as zero words, never flagged.
  "p/figures/fig4.tex": "\\caption{{#}}",
  "p/figures/notes.txt": "not a figure",
  "clean/paper.tex": tex("Short and plain. Nothing else."),
  "empty/paper.tex": "\\documentclass{article}",
  "page.txt":
    "A rendered page. It was hyphen-\nated across a line.\n\n12\n\fNext page text here.\nReferences\n[1] cut here.\n",
  "notes.rtf": "not a paper",
});

test("no arguments: the usage line, exit 0", () => {
  assert.deepEqual(runNode(SCRIPT), {
    status: 0,
    stdout: "",
    stderr:
      "usage: node prose-lint.mjs <paper.tex|page.txt> [more files] [--flags-only|--headings]\n",
  });
});

test(
  "🔴 a paper.tex is measured on the prose a reader sees — not its preamble, comments or inline .bib",
  { timeout: SPAWN_LATEX_MS },
  () => {
    const r = runNode(SCRIPT, [ACCEPTED]);
    // Guards: a .tex read as raw text counted the preamble, the comments and the `filecontents`
    // bibliography — 8127 "words" on this paper's submitted version against about 4636 real ones.
    const words = Number(
      /^=== paper\.tex — (\d+) words, \d+ sentences ===$/m.exec(r.stdout)?.[1],
    );
    assert.deepEqual(
      {
        status: r.status,
        stderr: r.stderr,
        inBand: words > 4000 && words < 5500,
      },
      { status: 0, stderr: "", inBand: true },
    );
    // No BibTeX field and no preamble command reaches the measured text.
    assert.doesNotMatch(r.stdout, /author\s*=|\\usepackage|\\documentclass/);
    expect(r.stdout).toMatchSnapshot();
  },
);

test(
  "--headings on a paper.tex lists its section titles, in order",
  { timeout: SPAWN_LATEX_MS },
  () => {
    const r = runNode(SCRIPT, ["--headings", ACCEPTED]);
    assert.deepEqual(
      { status: r.status, stderr: r.stderr },
      { status: 0, stderr: "" },
    );
    expect(r.stdout).toMatchSnapshot();
  },
);

test("the report over a rendered page: page numbers, hyphenation and the references are dropped", () => {
  const r = runNode(SCRIPT, [join(root, "page.txt")]);
  assert.deepEqual(
    { status: r.status, stderr: r.stderr },
    { status: 0, stderr: "" },
  );
  expect(r.stdout).toMatchSnapshot();
});

test("--headings on a rendered page is refused: it marks no heading", () => {
  const file = join(root, "page.txt");
  assert.deepEqual(runNode(SCRIPT, ["--headings", file]), {
    status: 2,
    stdout: "",
    stderr: `prose-lint: --headings reads a paper.tex — a rendered page (${file}) marks no heading\n`,
  });
});

test("a file that is neither a paper.tex nor a rendered page is refused with exit 2, and nothing is measured", () => {
  const file = join(root, "notes.rtf");
  assert.deepEqual(runNode(SCRIPT, [file]), {
    status: 2,
    stdout: "",
    stderr: `prose-lint reads a paper.tex or the text of its rendered PDF (.txt), not: ${file}\n`,
  });
});

test("--flags-only: an over-long caption flags and exits 1", () => {
  const r = runNode(SCRIPT, ["--flags-only", join(root, "p", "paper.tex")]);
  assert.deepEqual(
    { status: r.status, stdout: r.stdout },
    { status: 1, stdout: "" },
  );
  expect(r.stderr).toMatchSnapshot();
});

test("--flags-only: a paper with no figures directory is clean, exit 0 and silent", () => {
  assert.deepEqual(
    runNode(SCRIPT, ["--flags-only", join(root, "clean", "paper.tex")]),
    { status: 0, stdout: "", stderr: "" },
  );
});

test("a .tex with no prose in its body is refused with exit 2, not reported as NaN", () => {
  const file = join(root, "empty", "paper.tex");
  assert.deepEqual(runNode(SCRIPT, [file]), {
    status: 2,
    stdout: "",
    stderr:
      `prose-lint: ${file} has no prose to measure — after the preamble, comments, floats and ` +
      "the back matter are left out, no word is left.\n",
  });
});

test("a rendered page with no sentence before its references is refused the same way", () => {
  writeTree(root, { "blank.txt": "12\nReferences\n[1] only this.\n" });
  const file = join(root, "blank.txt");
  assert.deepEqual(runNode(SCRIPT, [file]), {
    status: 2,
    stdout: "",
    stderr: `prose-lint: ${file} has no prose to measure — no sentence is left before the references.\n`,
  });
});
