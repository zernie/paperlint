/**
 * cold-read-core.ts: the extract a cold read's readers are given — only the changed paragraphs,
 * whole, as plain text — and the command that prints it. No model, no network.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, vi } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";
import { changedLines, extract, main, numbered } from "./cold-read-core.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "cold-read.ts");
const root = useTempDir("cold-read-");

const BASE = `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Coding agents read a rules file before every task.

We measure how often an agent follows each rule.

\\begin{table}
a & b \\\\
\\end{table}

Rules files are widely used.
\\end{document}
`;

const EDITED = BASE.replace(
  "We measure how often an agent follows each rule.",
  "% JUSTIFY this later\nWe measure it with \\texttt{--no-verify} on {{nRepos}} repositories~\\cite{x}.\nAgents followed 71\\% of them.",
)
  .replace("a & b", "a & c")
  .replace(
    "Rules files are widely used.",
    "Three answers, all of them after the fact.",
  );

test("changedLines: the new-file lines of each hunk, a one-line hunk with no count included", () => {
  const diff =
    "@@ -3 +3 @@\n-a\n+b\n@@ -10,0 +11,2 @@\n+c\n+d\n@@ -20,2 +22,0 @@\n";
  assert.deepEqual(changedLines(diff), [3, 11, 12]);
});

test("extract: whole paragraphs, comments and floats dropped, macros expanded, dashes kept", () => {
  // What `git diff -U0` reports for EDITED: the comment (6), the paragraph (7–8), a table row (11), the last line of prose (14).
  const lines = [6, 7, 8, 11, 14];
  assert.deepEqual(extract(EDITED, lines, { nRepos: 40 }), [
    {
      start: 7,
      end: 8,
      text: "We measure it with --no-verify on 40 repositories [1]. Agents followed 71% of them.",
      unexpanded: [],
    },
    {
      start: 14,
      end: 14,
      text: "Three answers, all of them after the fact.",
      unexpanded: [],
    },
  ]);
  assert.deepEqual(
    extract(EDITED, [8], {}).map((p) => p.unexpanded),
    [["{{nRepos}}"]],
  );
  assert.deepEqual(
    extract(EDITED, [3, 6, 11]),
    [],
    "a heading, a comment or a table row is not prose",
  );
  assert.deepEqual(
    extract("Two groups {{a}{b}} and one {x} are not placeholders.\n", [1]),
    [
      {
        start: 1,
        end: 1,
        text: "Two groups ab and one x are not placeholders.",
        unexpanded: [],
      },
    ],
  );
});

/** A paper repo with one commit and an edit on top. */
const paperRepo = (name: string): string => {
  const dir = writeTree(join(root, name), { "paper.tex": BASE });
  const git = (...a: string[]): string =>
    execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
  writeFileSync(join(dir, "paper.tex"), EDITED);
  return dir;
};

/** `main` run in this process (so coverage sees it), its stdout and stderr captured. */
const runMain = (
  argv: string[],
): { status: number; stdout: string; stderr: string } => {
  const out: string[] = [];
  const err: string[] = [];
  const spies = [
    vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c) => out.push(String(c)) > 0),
    vi
      .spyOn(process.stderr, "write")
      .mockImplementation((c) => err.push(String(c)) > 0),
  ];
  try {
    const status = main(argv);
    return { status, stdout: out.join(""), stderr: err.join("") };
  } finally {
    spies.forEach((s) => {
      s.mockRestore();
    });
  }
};

test("the command prints only the changed paragraphs, numbered, and leaves the paper alone", () => {
  const dir = paperRepo("prints");
  writeFileSync(join(dir, "m.json"), '{"nRepos": 40}');
  const r = runMain([
    join(dir, "paper.tex"),
    `--macros=${join(dir, "m.json")}`,
  ]);
  assert.deepEqual(r, {
    status: 0,
    stdout:
      "¶1 We measure it with --no-verify on 40 repositories [1]. Agents followed 71% of them.\n\n" +
      "¶2 Three answers, all of them after the fact.\n",
    stderr: "",
  });
  assert.equal(readFileSync(join(dir, "paper.tex"), "utf8"), EDITED);
});

test("the command warns of a placeholder it has no value for, and still prints", () => {
  const r = runMain([join(paperRepo("warns"), "paper.tex")]);
  assert.equal(r.status, 0);
  assert.equal(
    r.stderr,
    "cold read: warning — {{nRepos}} has no value; pass --macros\n",
  );
  assert.ok(
    r.stdout.startsWith(
      "¶1 We measure it with --no-verify on nRepos repositories",
    ),
  );
});

test("numbered: one block per paragraph, nothing else", () => {
  assert.equal(
    numbered([
      { start: 1, end: 1, text: "A.", unexpanded: [] },
      { start: 3, end: 4, text: "B.", unexpanded: [] },
    ]),
    "¶1 A.\n\n¶2 B.",
  );
});

test("the command refuses: above the cap, no change, a bad flag, no paper", () => {
  const dir = paperRepo("refuse");
  const paper = join(dir, "paper.tex");
  const run = (args: string[]) => {
    const r = runMain(args);
    return [r.status, r.stderr] as const;
  };
  const capped = run([paper, "--max=1"]);
  execFileSync("git", ["checkout", "-q", "paper.tex"], { cwd: dir });
  assert.deepEqual(
    [
      capped,
      run([paper]),
      run([paper, "--bogus"]),
      run([]),
      run(["--max=0", paper]),
      run([join(dir, "nope.tex")]),
    ],
    [
      [
        2,
        "cold read: 2 changed paragraphs since HEAD, above the cap of 1: narrow --base to fewer commits, or raise --max knowingly\n",
      ],
      [2, `cold read: no changed prose in ${paper} since HEAD\n`],
      [2, "cold read: unknown flag(s) --bogus\n"],
      [2, "cold read: name exactly one paper .tex file\n"],
      [2, "cold read: --max takes a positive integer\n"],
      [2, `cold read: ${join(dir, "nope.tex")} does not exist\n`],
    ],
  );
});

test("cold-read.ts: the entry prints the paragraphs, and turns an unexpected error into exit 2", () => {
  const dir = paperRepo("entry");
  const ok = runNode(SCRIPT, ["paper.tex", "--base=HEAD"], { cwd: dir });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(
    ok.stdout.endsWith("¶2 Three answers, all of them after the fact.\n"),
  );
  writeFileSync(join(dir, "bad.json"), "{");
  const bad = runNode(SCRIPT, ["paper.tex", "--macros=bad.json"], { cwd: dir });
  // The parser's own words, from the same Node the child runs on: they differ between versions.
  const why = ((): string => {
    try {
      return String(JSON.parse("{"));
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  })();
  assert.deepEqual([bad.status, bad.stderr], [2, `cold read: ${why}\n`]);
});
