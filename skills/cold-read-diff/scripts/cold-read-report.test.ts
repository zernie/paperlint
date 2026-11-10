/**
 * cold-read-report.ts: the readers' prompts, the rows read back from their answers, the report
 * file and the caller's table — and `cold-read.js report` end to end on answer files. No model.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, vi } from "vitest";
import { useTempDir, writeTree } from "../../../test/support.ts";
import { main } from "./cold-read-core.ts";
import {
  answerOf,
  findingsOf,
  prompts,
  reportOf,
  rowsOf,
  summary,
} from "./cold-read-report.ts";

const root = useTempDir("cold-read-report-");

const PARAGRAPHS = [
  {
    start: 3,
    end: 3,
    text: "Three answers, all of them after the fact.",
    unexpanded: [],
  },
];

const ANSWER = `| ¶ | verdict | sentence | why |
|---|---|---|---|
| 1 | CANNOT PARSE | Three answers, all of them after the fact. | no question was asked |
| 1 | CLEVER | a \\| b | the pipe is escaped |
`;

test("prompts: each holds the paragraphs and the answer format; only the reviewer is told the venue", () => {
  const asked = prompts(PARAGRAPHS, "WS");
  for (const p of [asked.engineer, asked.reviewer]) {
    assert.ok(p.endsWith("\n\n¶1 Three answers, all of them after the fact."));
    assert.ok(p.includes("| ¶ | verdict | sentence | why |"));
  }
  assert.ok(asked.reviewer.includes("programme-committee member at WS,"));
  assert.ok(!asked.engineer.includes("WS"));
  assert.ok(
    prompts(PARAGRAPHS, "").reviewer.includes("at a peer-reviewed workshop,"),
  );
});

test("rowsOf: the table's rows by the markdown parse, an escaped pipe kept in its cell", () => {
  assert.deepEqual(rowsOf(ANSWER), [
    {
      p: "1",
      verdict: "CANNOT PARSE",
      sentence: "Three answers, all of them after the fact.",
      why: "no question was asked",
    },
    {
      p: "1",
      verdict: "CLEVER",
      sentence: "a | b",
      why: "the pipe is escaped",
    },
  ]);
});

test("rowsOf: a header with no rows is no findings; prose or a table of another shape is unreadable", () => {
  assert.deepEqual(
    rowsOf("| ¶ | verdict | sentence | why |\n|---|---|---|---|\n"),
    [],
  );
  assert.equal(rowsOf("Every sentence reads fine."), null);
  assert.equal(rowsOf("| a | b |\n|---|---|\n| 1 | 2 |\n"), null);
});

test("findingsOf: numbered across both readers, engineer first; no answer and unreadable add none", () => {
  const answers = { engineer: answerOf(ANSWER), reviewer: answerOf(ANSWER) };
  assert.deepEqual(
    findingsOf(answers).map((f) => [f.id, f.reader, f.verdict]),
    [
      [1, "engineer", "CANNOT PARSE"],
      [2, "engineer", "CLEVER"],
      [3, "reviewer", "CANNOT PARSE"],
      [4, "reviewer", "CLEVER"],
    ],
  );
  assert.deepEqual(
    findingsOf({ engineer: answerOf(null), reviewer: answerOf("prose") }),
    [],
  );
});

test("summary: at most 15 lines however many findings, and says which reader gave nothing", () => {
  const many = `| ¶ | verdict | sentence | why |\n|---|---|---|---|\n${Array.from({ length: 30 }, (_, i) => `| 1 | CLEVER | S${String(i)} | w |`).join("\n")}\n`;
  const lines = summary(
    { engineer: answerOf(many), reviewer: answerOf(null) },
    1,
    "reviews/r.md",
  ).split("\n");
  assert.equal(lines.length, 14);
  assert.equal(
    lines[0],
    "cold read: 1 paragraph(s), 30 finding(s) (reviewer: no answer) → reviews/r.md",
  );
  assert.equal(lines[3], "| 1 | engineer | CLEVER | S0 |");
  assert.equal(lines.at(-1), "… and 20 more in the report");
  assert.equal(
    summary(
      {
        engineer: answerOf("prose"),
        reviewer: answerOf(ANSWER.split("\n").slice(0, 2).join("\n")),
      },
      1,
      "r.md",
    ),
    "cold read: 1 paragraph(s), 0 finding(s) (engineer: unreadable) → r.md",
  );
});

test("summary: a long sentence is clipped; both readers answering name no gap", () => {
  const long = `| ¶ | verdict | sentence | why |\n|---|---|---|---|\n| 1 | CLEVER | ${"word ".repeat(20)}end | w |\n`;
  assert.deepEqual(
    summary(
      {
        engineer: answerOf(long),
        reviewer: answerOf(ANSWER.split("\n").slice(0, 2).join("\n")),
      },
      2,
      "r.md",
    ).split("\n"),
    [
      "cold read: 2 paragraph(s), 1 finding(s) → r.md",
      "| # | reader | verdict | sentence |",
      "|---|---|---|---|",
      `| 1 | engineer | CLEVER | ${"word ".repeat(20).slice(0, 69)}… |`,
    ],
  );
});

test("reportOf: no findings at all reads None., and an unnamed venue says so", () => {
  const report = reportOf({
    paper: "paper.tex",
    base: "HEAD",
    venue: "",
    paragraphs: PARAGRAPHS,
    answers: {
      engineer: answerOf(
        "| ¶ | verdict | sentence | why |\n|---|---|---|---|\n",
      ),
      reviewer: answerOf(null),
    },
  });
  assert.ok(report.includes("## Findings\n\nNone.\n"));
  assert.ok(report.includes("(venue: not named)"));
});

test("reportOf: the findings, the paragraphs and each answer verbatim; no answer is said, not left blank", () => {
  const report = reportOf({
    paper: "paper.tex",
    base: "HEAD",
    venue: "WS",
    paragraphs: PARAGRAPHS,
    answers: { engineer: answerOf(ANSWER), reviewer: answerOf(null) },
  });
  assert.ok(
    report.includes(
      "| 1 | engineer | 1 | CANNOT PARSE | Three answers, all of them after the fact. | no question was asked |",
    ),
  );
  assert.ok(
    report.includes(
      "| 2 | engineer | 1 | CLEVER | a \\| b | the pipe is escaped |",
    ),
  );
  assert.ok(
    report.includes(
      "## What the readers were given\n\n¶1 Three answers, all of them after the fact.",
    ),
  );
  assert.ok(
    report.includes(
      `## The engineer's answer, verbatim\n\n\`\`\`\`\n${ANSWER.trim()}\n\`\`\`\``,
    ),
  );
  assert.ok(
    report.includes(
      "## The reviewer's answer, verbatim\n\nNo answer within the time limit.",
    ),
  );
  assert.ok(
    !report.startsWith("---"),
    "an undecided finding has no frontmatter record yet",
  );
});

/** `main` in this process, its stdout and stderr captured. */
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
    return { status: main(argv), stdout: out.join(""), stderr: err.join("") };
  } finally {
    spies.forEach((s) => {
      s.mockRestore();
    });
  }
};

/** A paper repo with one commit and one changed paragraph on top. */
const paperRepo = (name: string): string => {
  const base =
    "\\begin{document}\nRules files are widely used.\n\\end{document}\n";
  const dir = writeTree(join(root, name), { "paper.tex": base });
  const git = (...a: string[]): string =>
    execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
  writeFileSync(
    join(dir, "paper.tex"),
    base.replace(
      "Rules files are widely used.",
      "Three answers, all of them after the fact.",
    ),
  );
  return dir;
};

test("report: writes the report under the paper's reviews/ by default, prints the table, edits nothing", () => {
  const dir = paperRepo("report");
  writeFileSync(join(dir, "engineer.md"), ANSWER);
  const before = readFileSync(join(dir, "paper.tex"), "utf8");
  const r = runMain([
    "report",
    join(dir, "paper.tex"),
    `--engineer=${join(dir, "engineer.md")}`,
    "--reviewer=none",
  ]);
  const [name = ""] = readdirSync(join(dir, "reviews"));
  // <YYYY-MM-DD-HHMMSS>-cold-read-diff.md
  assert.deepEqual(
    [name.endsWith("-cold-read-diff.md"), name.length],
    [true, 35],
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    [
      `cold read: 1 paragraph(s), 2 finding(s) (reviewer: no answer) → ${join(dir, "reviews", name)}`,
      "| # | reader | verdict | sentence |",
      "|---|---|---|---|",
      "| 1 | engineer | CANNOT PARSE | Three answers, all of them after the fact. |",
      "| 2 | engineer | CLEVER | a \\| b |",
      "",
    ].join("\n"),
  );
  assert.ok(
    readFileSync(join(dir, "reviews", name), "utf8").startsWith(
      "# Cold read — paper.tex (HEAD to the working tree)",
    ),
  );
  assert.equal(readFileSync(join(dir, "paper.tex"), "utf8"), before);
});

test("report refuses: an answer not named, an answer file that is not there, a report-only flag without report", () => {
  const dir = paperRepo("refuse");
  const paper = join(dir, "paper.tex");
  const run = (args: string[]): readonly [number, string] => {
    const r = runMain(args);
    return [r.status, r.stderr] as const;
  };
  assert.deepEqual(
    [
      run(["report", paper, "--reviewer=none"]),
      run([
        "report",
        paper,
        "--engineer=none",
        `--reviewer=${join(dir, "nope.md")}`,
      ]),
      run([paper, "--engineer=none"]),
    ],
    [
      [2, "cold read: report needs --engineer=FILE, or --engineer=none\n"],
      [2, `cold read: --reviewer: ${join(dir, "nope.md")} does not exist\n`],
      [2, "cold read: unknown flag(s) --engineer\n"],
    ],
  );
});
