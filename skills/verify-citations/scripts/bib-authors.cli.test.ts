/**
 * bib-authors.mjs as a process: the bibliography it reads (a .bib named, or what TeX reads for a
 * paper directory or a .tex — `paperSources`), the targets it refuses, and the report and exit code
 * for each outcome. DBLP is a preload that answers
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
import { absolutePath } from "#src/domain/paths";
import { bibliographyUnreadWhy } from "#src/paper-sources";

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

/** A .tex that declares the database `name`, with `preamble` before its document. */
const declaring = (name: string, preamble = "") =>
  `\\documentclass{article}\n${preamble}\\begin{document}x\\bibliography{${name}}\\end{document}\n`;

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
  "findings/paper.tex": declaring("paper"),
  "findings/paper.bib":
    bib("dropped", "Ada Lovelace and Grace Hopper", "Dropped Author") +
    bib("order", "Alan Turing and Ada Lovelace", "Swapped Order"),
  "findings/other.bib": bib("never", "X", "Never Read"),
  "twotex/b.tex": "\\documentclass{article}\n",
  "twotex/a.tex": declaring(
    "refs",
    "\\begin{filecontents*}[overwrite]{refs.bib}\n" +
      bib("pre", "Ada Lovelace", "A Preprint", "journal = {arXiv preprint}") +
      "\\end{filecontents*}\n",
  ),
  "sibling/paper.tex": declaring("refs"),
  "sibling/refs.bib": bib("good", "Ada Lovelace", "All Good"),
  "etal/paper.tex": declaring("refs"),
  "etal/notes.txt": "not a bibliography\n",
  "etal/refs.bib":
    bib("good", "Ada Lovelace", "All Good") +
    bib("etal", "Ada Lovelace and others", "Truncated"),
  "down/paper.tex": declaring("refs"),
  "down/refs.bib": bib("down", "Ada Lovelace", "Service Down"),
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

test("refusals: no argument; a path with no bibliography to read, in bibliographyAt's words", () => {
  // The path → bibliography vocabulary is tested once, beside bibliographyAt (src/paper-sources.ts).
  // Here: that the command speaks it, and exits 2.
  const notes = join(root, "etal", "notes.txt");
  assert.deepEqual(
    [run(), run(notes)].map(({ status, stdout, stderr }) => ({
      status,
      stdout,
      stderr,
    })),
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
        stderr: `bib-authors: ${bibliographyUnreadWhy({ kind: "not-bib-or-tex", path: absolutePath(notes) }).replaceAll(root, "<root>")}\n`,
      },
    ],
  );
});

test("a paper directory: the paper.bib its \\bibliography{paper} declares is read, and each difference is printed — FAIL, exit 1", () => {
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

test("a .tex named is read — never a guess among a directory's .tex files", () => {
  const r = run(join(root, "twotex", "a.tex"), "--json");
  assert.deepEqual(
    { status: r.status, stderr: r.stderr, report: parseJson(r.stdout) },
    {
      status: 0,
      stderr: "",
      report: {
        file: "<root>/twotex/a.tex",
        files: ["<root>/twotex/a.tex"],
        entries: 1,
        findings: [],
        skipped: [],
        unchecked: [],
      },
    },
  );
});

test("a .bib named is read as itself", () => {
  const r = run(join(root, "findings", "paper.bib"), "--json");
  const report: unknown = parseJson(r.stdout);
  assert.deepEqual(
    report !== null && typeof report === "object" && "files" in report
      ? report.files
      : report,
    ["<root>/findings/paper.bib"],
  );
});

test("a .tex that declares refs and has no block reads refs.bib — PASS, exit 0", () => {
  const r = run(join(root, "sibling", "paper.tex"));
  assert.deepEqual(r, {
    status: 0,
    stderr: "",
    stdout:
      "== bib-authors: <root>/sibling/refs.bib ==\n\n-- 1 entries · 0 difference(s) · 0 not applicable · 0 NOT CHECKED\nPASS: no author-list disagreement.\n",
  });
});

test("an `and others` entry is printed as not applicable, not dropped", () => {
  const r = run(join(root, "etal"));
  assert.deepEqual(r, {
    status: 0,
    stderr: "",
    stdout:
      "== bib-authors: <root>/etal/refs.bib ==\n" +
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

// The planted papers of fixtures/paper-sources: the file read is the one TeX reads (tex-truth.json).
const PLANTED = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/paper-sources",
);

test.each([
  ["v1-stale", "refs.bib"],
  ["v2-overwrite", "paper.tex"],
  ["v3-declared", "paper.bib"],
  ["v4-commented", "refs.bib"],
])("%s: reads %s", (paper, file) => {
  const r = runNode(SCRIPT, [join(PLANTED, paper), "--json"], {
    nodeArgs: ["--import", join(root, "dblp.mjs")],
  });
  const report: unknown = parseJson(r.stdout);
  assert.deepEqual(
    report !== null && typeof report === "object" && "files" in report
      ? report.files
      : report,
    [join(PLANTED, paper, file)],
  );
});
