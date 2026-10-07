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
import { cpSync } from "node:fs";
import { layRecord, recordedTree } from "../../test/recorded-fixture.ts";
import { runNode, useTempDir, writeTree } from "../../test/support.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "prose-lint.mjs");
/**
 * One process that loads the LaTeX parser and reads a full accepted paper: about 1 s alone, 5.6 s
 * measured under coverage with the suite running in parallel — past vitest's 5 s default.
 */
const SPAWN_LATEX_MS = 60_000;
/** An accepted paper whose bibliography sits inline in `filecontents`, beside a long preamble. */
const ACCEPTED_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "accepted-papers",
  "agenticdev-acm26",
);
const root = useTempDir("prose-lint-");
/** The accepted paper as a build left it: a copy with TeX's record laid at `_build/sources.json`. */
const ACCEPTED = join(root, "accepted", "paper.tex");

const LONG_CAPTION_SENTENCE = Array.from(
  { length: 45 },
  (_, i) => `word${String(i)}`,
).join(" ");

/** A paper.tex whose body is `body`. */
const tex = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

const TREE = {
  "p/paper.tex": tex(
    "\\section{Introduction}\nIn this paper we present a linter. It might possibly help.\n\\input{figures/fig1}\n\\input{figures/fig2}\n\\input{figures/fig4}\n\\input{figures/fig5}",
  ),
  "p/figures/fig1.tex": `\\begin{figure}\\caption{\\textbf{Big.} ${LONG_CAPTION_SENTENCE}. ${"More words here. ".repeat(20)}}\\end{figure}`,
  // Empty once LaTeX commands and braces are stripped: skipped, not counted as a zero-word caption.
  "p/figures/fig2.tex": "\\caption{\\centering}",
  // A lone "#": no word at all — measured as zero words, never flagged.
  "p/figures/fig4.tex": "\\caption{{#}}",
  // Rules only: seen by the reader, but no word once the dashes are stripped — skipped.
  "p/figures/fig5.tex": "\\caption{---}",
  "p/figures/notes.txt": "not a figure",
  "clean/paper.tex": tex("Short and plain. Nothing else."),
  // Captions in the paper itself and in a section it includes — not under figures/.
  "inline/paper.tex": tex(
    `Prose here. \\begin{figure}\\caption{${LONG_CAPTION_SENTENCE}.}\\end{figure}\n\\input{sec/results}`,
  ),
  "inline/sec/results.tex": `\\begin{figure}\\caption{${"Short words here. ".repeat(40)}}\\end{figure}`,
  // One real over-long caption, and the same caption commented out and inside verbatim.
  "commented/paper.tex": tex(
    `Prose here.\n% \\caption{Commented ${LONG_CAPTION_SENTENCE}.}\n\\begin{verbatim}\n\\caption{Quoted ${LONG_CAPTION_SENTENCE}.}\n\\end{verbatim}\n\\begin{figure}\\caption{Real ${LONG_CAPTION_SENTENCE}.}\\end{figure}`,
  ),
  "ends-on-marks/paper.tex": tex(
    "The method holds on every input~\\cite{knuth}. The proof is given in full (Section~\\ref{proof}). The result is new.",
  ),
  "empty/paper.tex": "\\documentclass{article}",
  "page.txt":
    "A rendered page. It was hyphen-\nated across a line.\n\n12\n\fNext page text here.\nReferences\n[1] cut here.\n",
  "notes.rtf": "not a paper",
};
/** What each paper's last build read: its paper.tex, and the files it includes. */
const READ: Readonly<Record<string, readonly string[]>> = {
  p: [
    "paper.tex",
    "figures/fig1.tex",
    "figures/fig2.tex",
    "figures/fig4.tex",
    "figures/fig5.tex",
  ],
  clean: ["paper.tex"],
  inline: ["paper.tex", "sec/results.tex"],
  commented: ["paper.tex"],
  "ends-on-marks": ["paper.tex"],
  empty: ["paper.tex"],
};
writeTree(
  root,
  Object.entries(READ).reduce<Record<string, string>>(
    (tree, [dir, files]) =>
      recordedTree(
        tree,
        dir,
        files.map((path) => ({ path, role: "body" as const })),
      ),
    TREE,
  ),
);
cpSync(ACCEPTED_DIR, join(root, "accepted"), { recursive: true });
layRecord(join(root, "accepted"), join(ACCEPTED_DIR, "tex-truth.json"));

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

test("🔴 in a paper.tex, a sentence ending on a citation or a cross-reference wastes its stress position", () => {
  const r = runNode(SCRIPT, [join(root, "ends-on-marks", "paper.tex")]);
  // Guards: the marks used to be dropped from the prose, so neither ending could be seen.
  assert.match(
    r.stdout,
    /^FLAG sentences ending on a cross-ref\/citation\/hedge \(wasted stress position\): 2$/m,
  );
});

test("🔴 --flags-only reads the captions of the paper.tex and of the files it includes", () => {
  const r = runNode(SCRIPT, [
    "--flags-only",
    join(root, "inline", "paper.tex"),
  ]);
  // Guards: captions were read only from figures/*.tex beside the paper, so a caption set inline,
  // or in an included section, was never checked and the run exited clean.
  assert.deepEqual(
    {
      status: r.status,
      stdout: r.stdout,
      flagged: r.stderr
        .split("\n")
        .filter((l) => l.startsWith("   "))
        .map((l) => l.split(":")[0]),
    },
    {
      status: 1,
      stdout: "",
      flagged: [
        "   paper.tex",
        "   sec/results.tex",
        "   run prose-lint.mjs on the file without --flags-only for the sentences",
      ],
    },
  );
});

test("--flags-only on a rendered page reads the captions in figures/*.tex beside it", () => {
  writeTree(root, {
    "rendered/page.txt": "A rendered page. Its prose is fine.\n",
    "rendered/figures/f.tex": `\\caption{${LONG_CAPTION_SENTENCE}.}`,
    "rendered/figures/notes.txt": "not a figure",
  });
  const r = runNode(SCRIPT, [
    "--flags-only",
    join(root, "rendered", "page.txt"),
  ]);
  assert.deepEqual(
    { status: r.status, first: r.stderr.split("\n")[1]?.split(":")[0] },
    { status: 1, first: "   figures/f.tex" },
  );
  // …and a page with no figures/ beside it has no caption to flag.
  assert.deepEqual(runNode(SCRIPT, ["--flags-only", join(root, "page.txt")]), {
    status: 0,
    stdout: "",
    stderr: "",
  });
});

test("🔴 a caption commented out or quoted in verbatim is not measured; a real one still is", () => {
  const r = runNode(SCRIPT, [
    "--flags-only",
    join(root, "commented", "paper.tex"),
  ]);
  // Guards: the scan matched every `\caption{` in the raw text, comments and verbatim included.
  assert.deepEqual(
    {
      status: r.status,
      findings: r.stderr
        .split("\n")
        .filter((l) => l.startsWith("   paper.tex:"))
        .map((l) => /— "(\w+)/.exec(l)?.[1]),
    },
    { status: 1, findings: ["Real"] },
  );
});
