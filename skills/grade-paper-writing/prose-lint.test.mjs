/**
 * prose-lint.mjs as a process — the way the skill and `run-mechanical.mjs` run it. Every mode, on
 * fixtures written here, with the WHOLE output compared: the report is the product, so a changed
 * number or a dropped line is a changed result.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../test/support.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "prose-lint.mjs");
const root = useTempDir("prose-lint-");

const LONG_CAPTION_SENTENCE = Array.from(
  { length: 45 },
  (_, i) => `word${i}`,
).join(" ");
const PAPER = `---
title: A title the linter must not read as a sentence
---
# The paper

<!-- TIGHTEN: a working note, not prose -->

## Introduction

In this paper we present a linter. It might possibly help, but this is not a proof. Clearly the
first result matters (Section 3). Prior work agrees [1, 2]. The speedup was 40% on average across the
full suite of papers, which suggests the method might hold generally.

- The first item is short.
- The second item is not long either.

\`\`\`
# a heading inside a code block is code
\`\`\`

| a | table |
|---|---|
| is | data |

### Method

We believe that rather than guessing, we measure. Instead of prose, the numbers speak.

## References

[1] A reference that is not prose.
`;

writeTree(root, {
  "p/paper.md": PAPER,
  "p/figures/fig1.tex": `\\begin{figure}\\caption{\\textbf{Big.} ${LONG_CAPTION_SENTENCE}. ${"More words here. ".repeat(20)}}\\end{figure}`,
  "p/figures/fig2.tex": "\\caption{\\label{x}}",
  "p/figures/notes.txt": "not a figure",
  "clean/paper.md": "## Intro\n\nShort and plain. Nothing else.\n",
  "page.txt":
    "A rendered page. It was hyphen-\nated across a line.\n\n12\n\fNext page text here.\nReferences\n[1] cut here.\n",
  "paper.tex": "\\documentclass{article}",
});

test("no arguments: the usage line, exit 0", () => {
  assert.deepEqual(runNode(SCRIPT), {
    status: 0,
    stdout: "",
    stderr: "usage: node prose-lint.mjs <file.md|file.txt> [more files]\n",
  });
});

test("a .tex file is refused with exit 2, and nothing is measured", () => {
  const r = runNode(SCRIPT, [join(root, "paper.tex")]);
  assert.deepEqual(
    { status: r.status, stdout: r.stdout },
    { status: 2, stdout: "" },
  );
  expect(r.stderr.replaceAll(root, "<root>")).toMatchSnapshot();
});

test("the full report over markdown and rendered text", () => {
  const r = runNode(SCRIPT, [
    join(root, "p", "paper.md"),
    join(root, "page.txt"),
  ]);
  assert.deepEqual(
    { status: r.status, stderr: r.stderr },
    { status: 0, stderr: "" },
  );
  expect(r.stdout).toMatchSnapshot();
});

test("--headings lists every heading from level 2 to 4, in order", () => {
  const r = runNode(SCRIPT, ["--headings", join(root, "p", "paper.md")]);
  assert.deepEqual(
    { status: r.status, stderr: r.stderr },
    { status: 0, stderr: "" },
  );
  expect(r.stdout).toMatchSnapshot();
});

test("--flags-only: an over-long caption flags and exits 1", () => {
  const r = runNode(SCRIPT, ["--flags-only", join(root, "p", "paper.md")]);
  assert.deepEqual(
    { status: r.status, stdout: r.stdout },
    { status: 1, stdout: "" },
  );
  expect(r.stderr).toMatchSnapshot();
});

test("--flags-only: a paper with no figures directory is clean, exit 0 and silent", () => {
  assert.deepEqual(
    runNode(SCRIPT, ["--flags-only", join(root, "clean", "paper.md")]),
    {
      status: 0,
      stdout: "",
      stderr: "",
    },
  );
});

test("a file with no prose left to measure is refused with exit 2, not reported as NaN", () => {
  writeTree(root, {
    "empty/paper.md":
      "---\ntitle: only frontmatter\n---\n<!-- and a note -->\n",
  });
  const file = join(root, "empty", "paper.md");
  assert.deepEqual(runNode(SCRIPT, [file]), {
    status: 2,
    stdout: "",
    stderr:
      `prose-lint: ${file} has no prose to measure — after the frontmatter, comments, code ` +
      "blocks, tables and the reference section are stripped, no word is left.\n",
  });
});
