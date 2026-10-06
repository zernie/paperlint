/**
 * bib-authors.mjs as a process: which file it picks from a paper directory, the bibliography
 * sources it reads (.bib, a .tex's filecontents or its sibling refs.bib), the Markdown file it
 * refuses, and the report and exit code for each outcome. DBLP is a preload that answers
 * by title from a table (the documented `result.hits.hit[].info` shape) — no network.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import {
  parseJson,
  runNode,
  useTempDir,
  writeTree,
} from "../../../test/support.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "bib-authors.mjs");
const root = useTempDir("bib-authors-cli-");

const DBLP_ANSWERS = {
  "Dropped Author": [["Ada Lovelace", "Alan Turing"]],
  "Swapped Order": [["Ada Lovelace", "Alan Turing"]],
  "All Good": [["Ada Lovelace"]],
};
const bib = (
  key: string,
  author: string,
  title: string,
  venue = "booktitle = {Proc. X}",
) =>
  `@inproceedings{${key}, author = {${author}}, title = {${title}}, ${venue}}\n`;

writeTree(root, {
  // The retry backoff (1.5 s, then 3 s) and the 900 ms courtesy pause are real sleeps in the
  // script. Under CPU load they made "DBLP down" take 11.7 s once and time out. The preload
  // stands in for the clock too: every timer fires at once, so no test here depends on time.
  "dblp.mjs":
    "const realSetTimeout = globalThis.setTimeout;\n" +
    "globalThis.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);\n" +
    `const answers = ${JSON.stringify(DBLP_ANSWERS)};\n` +
    "globalThis.fetch = async (url) => {\n" +
    "  const q = new URL(url).searchParams.get('q');\n" +
    "  if (q === 'Service Down') return new Response(null, { status: 500 });\n" +
    "  const hit = (answers[q] ?? []).map((authors) => ({ info: { title: q, venue: 'X', year: '2024',\n" +
    "    type: 'Conference and Workshop Papers', authors: { author: authors.map((text) => ({ text })) } } }));\n" +
    "  return new Response(JSON.stringify({ result: { hits: { hit } } }), { status: 200 });\n};\n",
  "findings/paper.bib":
    bib("dropped", "Ada Lovelace and Grace Hopper", "Dropped Author") +
    bib("order", "Alan Turing and Ada Lovelace", "Swapped Order"),
  "findings/other.bib": bib("never", "X", "Never Read"),
  "twotex/b.tex": "\\documentclass{article}\n",
  "twotex/a.tex":
    "\\begin{filecontents*}{refs.bib}\n" +
    bib("pre", "Ada Lovelace", "A Preprint", "journal = {arXiv preprint}") +
    "\\end{filecontents*}\n",
  "sibling/paper.tex": "\\documentclass{article}\n",
  "sibling/refs.bib": bib("good", "Ada Lovelace", "All Good"),
  "nobib/paper.tex": "\\documentclass{article}\n",
  "md/paper.md":
    "# P\n\n## References\n\n1. A. Lovelace. *All Good.* Proc. X, 2024.\n",
  "md/refs.bib":
    bib("good", "Ada Lovelace", "All Good") +
    bib("etal", "Ada Lovelace and others", "Truncated"),
  "down/refs.bib": bib("down", "Ada Lovelace", "Service Down"),
  "empty/.keep": "",
});

const run = (...args: string[]) => {
  const r = runNode(SCRIPT, args, {
    nodeArgs: ["--import", join(root, "dblp.mjs")],
  });
  return {
    ...r,
    stdout: r.stdout.replaceAll(root, "<root>"),
    stderr: r.stderr.replaceAll(root, "<root>"),
  };
};

test("refusals: no argument, no such path, a directory with nothing to read, a .tex with no bibliography", () => {
  assert.deepEqual(
    [
      run(),
      run(join(root, "nope")),
      run(join(root, "empty")),
      run(join(root, "nobib", "paper.tex")),
    ].map(({ status, stdout, stderr }) => ({ status, stdout, stderr })),
    [
      {
        status: 2,
        stdout: "",
        stderr:
          "bib-authors: usage: bib-authors.mjs <paper-dir|file.bib|file.tex> [--json]\n",
      },
      {
        status: 2,
        stdout: "",
        stderr: "bib-authors: no such path: <root>/nope\n",
      },
      {
        status: 2,
        stdout: "",
        stderr: "bib-authors: no .bib or .tex in <root>/empty\n",
      },
      {
        status: 2,
        stdout: "",
        stderr:
          "bib-authors: no bibliography found in <root>/nobib/paper.tex (no filecontents block, no refs.bib beside it)\n",
      },
    ],
  );
});

test("a paper directory: the canonical paper.bib is read, and each difference is printed — FAIL, exit 1", () => {
  assert.deepEqual(run(join(root, "findings")), {
    status: 1,
    stderr: "",
    stdout: [
      "== bib-authors: <root>/findings/paper.bib ==",
      "",
      "  🔴 dropped  (DBLP: X 2024)",
      "     MISSING from ours : turing",
      "     EXTRA in ours     : hopper",
      "",
      "  🔴 order  (DBLP: X 2024)",
      "     ORDER differs",
      "       ours : turing > lovelace",
      "       DBLP : lovelace > turing",
      "",
      "-- 2 entries · 2 difference(s) · 0 not applicable · 0 NOT CHECKED",
      "FAIL: our author list disagrees with the version we claim to cite.",
      "",
    ].join("\n"),
  });
});

test("two .tex files and no paper.tex: the first by name, said out loud; its filecontents is read", () => {
  const r = run(join(root, "twotex"), "--json");
  assert.deepEqual(
    { status: r.status, stderr: r.stderr, report: parseJson(r.stdout) },
    {
      status: 0,
      stderr:
        "⚠️ <root>/twotex holds several .tex files and no canonical paper.tex: a.tex, b.tex — took a.tex. If that is the wrong one, name the file explicitly.\n",
      report: {
        file: "<root>/twotex/a.tex",
        entries: 1,
        findings: [],
        skipped: [],
        unchecked: [],
      },
    },
  );
});

test("a .tex with no filecontents reads the refs.bib beside it — PASS, exit 0", () => {
  const r = run(join(root, "sibling", "paper.tex"));
  assert.deepEqual(r, {
    status: 0,
    stderr: "",
    stdout:
      "== bib-authors: <root>/sibling/refs.bib ==\n\n-- 1 entries · 0 difference(s) · 0 not applicable · 0 NOT CHECKED\nPASS: no author-list disagreement.\n",
  });
});

test("a Markdown paper is refused by name, not read — not even for the refs.bib beside it", () => {
  // Guards: a paper's bibliography is BibTeX; a reference list in paper.md is not a source, and a
  // Markdown file named on the command line must not quietly stand in for its sibling .bib.
  const r = run(join(root, "md", "paper.md"));
  assert.deepEqual(r, {
    status: 2,
    stdout: "",
    stderr:
      "bib-authors: <root>/md/paper.md is Markdown — give the paper's .bib or paper.tex\n",
  });
});

test("a directory holding a stray paper.md reads its .bib; an `and others` entry is printed as not applicable", () => {
  const r = run(join(root, "md"));
  assert.deepEqual(r, {
    status: 0,
    stderr: "",
    stdout:
      "== bib-authors: <root>/md/refs.bib ==\n" +
      "  · n/a etal — author list ends in `and others` — completeness not checkable\n\n" +
      "-- 2 entries · 0 difference(s) · 1 not applicable · 0 NOT CHECKED\nPASS: no author-list disagreement.\n",
  });
});

test("DBLP down: NOT CHECKED, PARTIAL, exit 2 — never a pass", () => {
  const r = run(join(root, "down"));
  assert.deepEqual(r, {
    status: 2,
    stderr: "",
    stdout:
      "== bib-authors: <root>/down/refs.bib ==\n" +
      "  ⚠️ NOT CHECKED down — DBLP lookup failed: DBLP 500\n\n" +
      "-- 1 entries · 0 difference(s) · 0 not applicable · 1 NOT CHECKED\n" +
      "PARTIAL: no disagreement among the entries reached, but 1 could not be checked — this is NOT a pass.\n",
  });
});
