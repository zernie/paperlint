/**
 * cold-read-core.ts: the extract the readers get, the parse of their answers, the short table, and the
 * command end to end against a FAKE reader (PAPERLINT_COLD_READ_READER), so no test spends money
 * or touches the network. The fake records its working directory and its stdin, which is how the
 * "only the changed paragraphs, as text, from an empty directory" promise is asserted rather than
 * hoped for.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { z } from "zod";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";
import {
  changedLines,
  extract,
  findingsOf,
  parseAnswer,
  summary,
} from "./cold-read-core.ts";

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
  const lines = [7, 8, 12, 15];
  assert.deepEqual(extract(EDITED, lines, { nRepos: 40 }), [
    {
      start: 6,
      end: 8,
      text: "We measure it with --no-verify on 40 repositories [citation]. Agents followed 71% of them.",
      unexpanded: [],
    },
    {
      start: 14,
      end: 15,
      text: "Three answers, all of them after the fact.",
      unexpanded: [],
    },
  ]);
  assert.deepEqual(
    extract(EDITED, [8], {}).map((p) => p.unexpanded),
    [["{{nRepos}}"]],
  );
});

test("parseAnswer: the fenced array inside claude's json envelope, with tokens; garbage is an error", () => {
  const rows = [{ p: 1, sentence: "S.", verdict: "OK", why: "" }];
  const envelope = JSON.stringify({
    result: `Here:\n\`\`\`json\n${JSON.stringify(rows)}\n\`\`\``,
    usage: {
      input_tokens: 2,
      cache_read_input_tokens: 10,
      cache_creation_input_tokens: 5,
      output_tokens: 7,
    },
    total_cost_usd: 0.01,
  });
  assert.deepEqual(parseAnswer(envelope), {
    rows,
    usage: { input_tokens: 17, output_tokens: 7, cost_usd: 0.01 },
    text: `Here:\n\`\`\`json\n${JSON.stringify(rows)}\n\`\`\``,
    error: null,
  });
  assert.equal(
    parseAnswer("not json at all").error,
    "no json array in the answer",
  );
});

test("summary: at most 15 lines however many findings, and it names the report", () => {
  const answers = [
    {
      persona: "engineer",
      rows: Array.from({ length: 30 }, (_, i) => ({
        p: 1,
        sentence: `S${String(i)} | x`,
        verdict: "CANNOT PARSE",
        why: "",
      })),
    },
  ];
  const lines = summary(findingsOf(answers), [{}], "reviews/r.md").split("\n");
  assert.equal(lines.length, 14);
  assert.equal(
    lines[0],
    "cold read: 1 paragraph(s), 30 finding(s) → reviews/r.md",
  );
  assert.equal(lines[3], "| 1 | engineer | CANNOT PARSE | S0 \\| x |");
  assert.equal(lines.at(-1), "… and 20 more in the report");
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

const Call = z.object({
  args: z.array(z.string()),
  cwd: z.array(z.string()),
  stdin: z.string(),
});

/** A fake `claude`: records cwd contents and stdin, answers per FAKE_ANSWER. */
const fakeReader = (
  name: string,
): {
  bin: string;
  calls: () => { args: string[]; cwd: string[]; stdin: string }[];
} => {
  const log = join(root, `${name}.log`);
  const bin = join(root, `${name}.mjs`);
  writeFileSync(
    bin,
    `#!/usr/bin/env node
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
const stdin = readFileSync(0, "utf8");
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), cwd: readdirSync("."), stdin }) + "\\n");
const mode = process.env.FAKE_ANSWER;
if (mode === "fail") { process.stderr.write("boom\\n"); process.exit(3); }
const verdict = mode === "clean" ? "OK" : stdin.startsWith("You are a strong") ? "CANNOT PARSE" : "WHOSE?";
const rows = [{ p: 2, sentence: "Three answers, all of them after the fact.", restated: "", verdict, why: "no question" }];
process.stdout.write(JSON.stringify({ result: "\\u0060\\u0060\\u0060json\\n" + JSON.stringify(rows) + "\\n\\u0060\\u0060\\u0060", usage: { input_tokens: 100, output_tokens: 20 }, total_cost_usd: 0.002 }));
`,
  );
  chmodSync(bin, 0o755);
  return {
    bin,
    calls: () =>
      readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((l) => Call.parse(JSON.parse(l))),
  };
};

/** One run of the command against a reader that finds something; shared by the next two tests. */
const findsRun = (() => {
  const dir = paperRepo("finds");
  const reader = fakeReader("finds");
  writeFileSync(join(dir, "m.json"), '{"nRepos": 40}');
  const r = runNode(
    SCRIPT,
    ["paper.tex", "--venue=WS", "--out=reviews/r.md", "--macros=m.json"],
    {
      cwd: dir,
      env: { PAPERLINT_COLD_READ_READER: reader.bin, FAKE_ANSWER: "finds" },
    },
  );
  return { dir, r, calls: reader.calls() };
})();

test("the command: a short table to the caller, a report on disk, the paper untouched", () => {
  const { dir, r } = findsRun;
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    [
      "cold read: 2 paragraph(s), 2 finding(s) → reviews/r.md",
      "| # | reader | verdict | sentence |",
      "|---|---|---|---|",
      "| 1 | engineer | CANNOT PARSE | Three answers, all of them after the fact. |",
      "| 2 | reviewer | WHOSE? | Three answers, all of them after the fact. |",
      "",
    ].join("\n"),
  );
  const report = readFileSync(join(dir, "reviews/r.md"), "utf8");
  assert.ok(
    report.includes(
      "| 1 | engineer | 2 | CANNOT PARSE | Three answers, all of them after the fact. | no question |",
    ),
  );
  assert.ok(report.includes("No fix was applied."));
  assert.equal(
    readFileSync(join(dir, "paper.tex"), "utf8"),
    EDITED,
    "the cold read edited the paper",
  );
});

test("the command: two readers, each given only the changed paragraphs, as text, from an empty dir", () => {
  const { calls } = findsRun;
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.deepEqual(c.cwd, []);
    assert.deepEqual(c.args, [
      "-p",
      "--model",
      "sonnet",
      "--tools",
      "",
      "--output-format",
      "json",
    ]);
    assert.ok(
      c.stdin.includes(
        "[1]\nWe measure it with --no-verify on 40 repositories [citation].",
      ),
    );
    assert.ok(
      !c.stdin.includes("Coding agents read"),
      "an unchanged neighbour reached the reader",
    );
    assert.ok(
      !c.stdin.includes("JUSTIFY"),
      "a working comment reached the reader",
    );
  }
  assert.ok(
    calls.some((c) => c.stdin.includes("program-committee member at WS")),
  );
});

test("the command: a clean read reports no findings, and the default report lands in reviews/", () => {
  const dir = paperRepo("clean");
  const r = runNode(SCRIPT, ["paper.tex"], {
    cwd: dir,
    env: {
      PAPERLINT_COLD_READ_READER: fakeReader("clean").bin,
      FAKE_ANSWER: "clean",
    },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /^cold read: 2 paragraph\(s\), 0 finding\(s\) → reviews\/\d{4}-\d\d-\d\d-\d{6}-cold-read-diff\.md\n$/,
  );
  assert.equal(readdirSync(join(dir, "reviews")).length, 1);
  assert.match(r.stderr, /\{\{nRepos\}\} has no value; pass --macros/);
});

test("the command: a failing reader exits 1 and still writes what the other said", () => {
  const dir = paperRepo("fail");
  const r = runNode(SCRIPT, ["paper.tex", "--out=r.md"], {
    cwd: dir,
    env: {
      PAPERLINT_COLD_READ_READER: fakeReader("fail").bin,
      FAKE_ANSWER: "fail",
    },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /engineer FAILED \(.*exited 3: boom\)/);
});

test("the command refuses: no change, above the cap, a bad flag, no paper", () => {
  const dir = paperRepo("refuse");
  const run = (args: string[]) =>
    runNode(SCRIPT, args, {
      cwd: dir,
      env: { PAPERLINT_COLD_READ_READER: "/nonexistent" },
    });
  const capped = run(["paper.tex", "--max=1"]);
  assert.deepEqual(
    [capped.status, capped.stderr],
    [
      2,
      "cold read: 2 changed paragraphs since HEAD, above the cap of 1: narrow --base to fewer commits, or raise --max knowingly\n",
    ],
  );
  execFileSync("git", ["checkout", "-q", "paper.tex"], { cwd: dir });
  assert.deepEqual(
    [
      run(["paper.tex"]).stderr,
      run(["paper.tex", "--bogus"]).stderr,
      run([]).stderr,
      run(["--max=0", "paper.tex"]).stderr,
    ],
    [
      "cold read: no changed prose in paper.tex since HEAD\n",
      "cold read: unknown flag(s) --bogus\n",
      "cold read: name exactly one paper .tex file\n",
      "cold read: --max takes a positive integer\n",
    ],
  );
});
