/**
 * run-mechanical.mjs — every row against a fake consumer whose checkers are stand-ins with a
 * scripted answer, so each way of READING a result (`exit`, `flags`, `json`, `eslint`) and each way
 * of NOT getting one (input missing, checker not installed, output that is not what the row reads)
 * is driven on purpose. What is compared is what the run tells a reader (stdout) and what it
 * records (the ledger rows, minus hashes and timestamps).
 *
 * The consumer root and the ledger are set BEFORE import: the module resolves both at load time.
 */
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test, vi } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "run-mechanical.mjs");
const root = useTempDir("run-mechanical-");
const consumer = join(root, "consumer");
const LEDGER = join(root, "runs.jsonl");

/** A node stand-in that prints what FAKE_<NAME> says and exits with FAKE_<NAME>_EXIT. */
const nodeFake = (name) =>
  `const out = process.env.FAKE_${name} ?? "";\n` +
  `process.stdout.write(out);\n` +
  `process.exit(Number(process.env.FAKE_${name}_EXIT ?? 0));\n`;
/** The same, in python — the citation checkers and the repro scripts are python. */
const pyFake = (name) =>
  `import os, sys\n` +
  `sys.stdout.write(os.environ.get("FAKE_${name}", ""))\n` +
  `sys.exit(int(os.environ.get("FAKE_${name}_EXIT", "0")))\n`;

writeTree(consumer, {
  "paperlint.json": JSON.stringify({ citeChecks: "cite" }),
  "cite/report-submission.py": pyFake("REPORT"),
  "cite/uncited_refs.py": pyFake("UNCITED"),
  "eslint-rules/paper-structure.mjs":
    'export default { "section-lead": {}, "subsection-size": {} };\n',
  "node_modules/.bin/eslint": `#!${process.execPath}\n${nodeFake("ESLINT")}`,
  // The stand-in hands over to the REAL prose-lint when asked, so the count the ledger records can
  // be checked against what the real checker printed.
  ".claude/skills/grade-paper-writing/prose-lint.mjs":
    `if (process.env.FAKE_PROSE_REAL) await import(${JSON.stringify(
      join(HERE, "..", "..", "grade-paper-writing", "prose-lint.mjs"),
    )});\n` + nodeFake("PROSE"),
  ".claude/skills/verify-citations/scripts/verify-cites.test.mjs":
    nodeFake("CITES"),
  // Paper A: a submission — a venue limit, a build, every repro checker present.
  "papers/a/paper.md": "# A\n\nA plain paragraph.\n",
  "papers/a/.body-limit": "8\n",
  "papers/a/build/paper.log": "log\n",
  "papers/a/build/paper.aux": "aux\n",
  "papers/a/build/acl_latex.pdf": "%PDF\n",
  "papers/a/repro/arm_permutation.py": pyFake("ARM"),
  "papers/a/repro/delivered_pdf.py": pyFake("DELIVERED"),
  "papers/a/repro/textidote_check.py": pyFake("TEXTIDOTE"),
  "papers/a/rounds/.keep": "",
  // Paper B: built in place, no venue, nothing optional.
  "papers/b/paper.md": "# B\n\nAnother paragraph.\n",
  // Paper C: one figure whose caption breaks BOTH caption limits — two prose-lint findings.
  "papers/c/paper.md": "# C\n\nA paragraph of prose.\n",
  "papers/c/figures/f.tex": `\\caption{${"word ".repeat(110)}}`,
  "papers/b/paper.log": "log\n",
  "textidote.jar": "",
});
chmodSync(join(consumer, "node_modules/.bin/eslint"), 0o755);

process.env.CLAUDE_PROJECT_DIR = consumer;
process.env.PIPELINE_LEDGER = LEDGER;
process.env.TEXTIDOTE_JAR = join(consumer, "textidote.jar");
const { GATES, main } = await import("./run-mechanical.mjs");

const ESLINT_FINDINGS = JSON.stringify([
  {
    filePath: "paper.md",
    messages: [
      {
        ruleId: "paper/section-lead",
        severity: 2,
        line: 1,
        column: 1,
        message: "no lead",
      },
      {
        ruleId: "paper/subsection-size",
        severity: 1,
        line: 3,
        column: 1,
        message: "long",
      },
      {
        ruleId: "paper/other-row",
        severity: 2,
        line: 4,
        column: 1,
        message: "not ours",
      },
    ],
  },
]);

/**
 * Run `main` on a paper with the given stand-in answers. Returns the exit code, the full stdout,
 * the closing summary (the lines after the last blank line — what a reader acts on), and the
 * ledger rows written, one compact string each: `skill/check KIND reason|findings [blocking]`.
 */
function run(paper, fakes = {}) {
  rmSync(LEDGER, { force: true });
  const saved = { ...process.env };
  Object.assign(process.env, fakes);
  const lines = [];
  const log = vi.spyOn(console, "log").mockImplementation((...a) => {
    lines.push(a.join(" "));
  });
  const err = vi.spyOn(console, "error").mockImplementation((...a) => {
    lines.push(`stderr: ${a.join(" ")}`);
  });
  let code;
  try {
    code = main(["node", SCRIPT, paper]);
  } finally {
    log.mockRestore();
    err.mockRestore();
    process.env = saved;
  }
  const rows = existsSync(LEDGER)
    ? readFileSync(LEDGER, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l))
        .map(
          ({ skill, check, kind, reason, findings, blocking }) =>
            `${skill}/${check} ${kind} ${kind === "FINDING" ? findings : reason}` +
            (blocking ? " blocking" : ""),
        )
    : [];
  const out = lines.join("\n").replaceAll(root, "<root>");
  const summary = out.trimEnd().split("\n\n").pop().split("\n");
  return { code, out, summary, rows };
}

afterEach(() => rmSync(LEDGER, { force: true }));

const NOTE =
  "   Judgement checks report and never fail the run; read them, and never grep this for green.";

test("a directory with no paper.md: exit 2, named", () => {
  const { code, out, rows } = run(join(root, "nowhere"));
  assert.deepEqual(
    { code, out, rows },
    { code: 2, out: "stderr: no paper.md in <root>/nowhere", rows: [] },
  );
});

test("two rows sharing a key are refused before anything runs", () => {
  GATES.push({ ...GATES[0] });
  try {
    const { code, out, rows } = run(join(consumer, "papers", "a"));
    assert.deepEqual(
      { code, out, rows },
      {
        code: 2,
        out: 'stderr: two checks share the row key "render-paper/report-submission" — they would take turns being the answer',
        rows: [],
      },
    );
  } finally {
    GATES.pop();
  }
});

test("paper A, every checker answering with findings: exit 1 on the blocking FACT findings", () => {
  const { code, summary, rows } = run(join(consumer, "papers", "a"), {
    FAKE_REPORT: "overfull box\nunresolved ref\n",
    FAKE_REPORT_EXIT: "1",
    FAKE_ESLINT: ESLINT_FINDINGS,
    FAKE_PROSE: "✍️  prose-lint — paper.md:\n   a long caption\n",
    FAKE_PROSE_EXIT: "1",
    FAKE_CITES: "1 fabricated entry\n",
    FAKE_CITES_EXIT: "1",
    FAKE_ARM: JSON.stringify([{ q: 1 }, { q: 2 }]),
    FAKE_DELIVERED: "not json",
    FAKE_TEXTIDOTE: "[]",
    FAKE_UNCITED: JSON.stringify(["smith2020"]),
  });
  assert.deepEqual(
    { code, summary, rows },
    {
      code: 1,
      summary: ["🔴 a FACT check found something — see above", NOTE],
      rows: [
        "render-paper/report-submission FINDING 2 blocking",
        "render-paper/report-submission-citations ABSTAINED input-missing",
        // Two of the three messages are this row's rules; the third belongs to another row.
        "tighten-paper/structure FINDING 2 blocking",
        // No stated count: the stand-in's two lines are counted.
        "grade-paper-writing/prose-lint FINDING 2",
        "verify-citations/verify-cites FINDING 1 blocking",
        "harden-paper/artifact-coverage ABSTAINED no-witness",
        "build-benchmark/check-provenance ABSTAINED no-witness",
        "build-benchmark/arm-permutation FINDING 2",
        "build-benchmark/delivered-pdf ABSTAINED crashed",
        "build-benchmark/generated-code ABSTAINED no-witness",
        "grade-paper-writing/textidote ABSTAINED no-witness",
        "verify-citations/uncited-refs FINDING 1",
        "draft-paper/population-map ABSTAINED no-witness",
        "tighten-paper/round-diff FINDING 1",
      ],
    },
  );
});

test("a finding's lines reach the reader, capped at twelve", () => {
  const { out } = run(join(consumer, "papers", "a"), {
    FAKE_ESLINT: "[]",
    FAKE_UNCITED: JSON.stringify(Array.from({ length: 20 }, (_, i) => `e${i}`)),
  });
  const block = out
    .split("\n\n")
    .find((b) => b.includes("uncited-refs — 20 finding(s)"));
  assert.deepEqual(block.split("\n"), [
    "🟠 verify-citations/uncited-refs — 20 finding(s) → reviews/mechanical/verify-citations--uncited-refs.md",
    "   a bibliography entry no \\cite in the paper points at",
    "   [",
    ...Array.from({ length: 11 }, (_, i) => `     "e${i}",`),
  ]);
});

test("eslint that crashed on the file, and eslint that ignored it, are not clean runs", () => {
  const fatal = JSON.stringify([
    {
      filePath: "p",
      messages: [{ ruleId: null, fatal: true, message: "Parsing error" }],
    },
  ]);
  const ignored = JSON.stringify([
    {
      filePath: "p",
      messages: [
        { ruleId: null, message: "File ignored because outside of base path." },
      ],
    },
  ]);
  const structure = (fakes) =>
    run(join(consumer, "papers", "a"), fakes).rows.find((x) =>
      x.startsWith("tighten-paper/structure "),
    );
  assert.deepEqual(
    [
      structure({ FAKE_ESLINT: fatal }),
      structure({ FAKE_ESLINT: ignored }),
      structure({ FAKE_ESLINT: "[]" }),
    ],
    [
      "tighten-paper/structure ABSTAINED crashed",
      "tighten-paper/structure ABSTAINED input-missing",
      "tighten-paper/structure ABSTAINED no-witness",
    ],
  );
});

test("paper B: every row whose input is absent abstains as input-missing; the rest judge", () => {
  const { code, summary, rows } = run(join(consumer, "papers", "b"), {
    FAKE_ESLINT: "[]",
  });
  assert.deepEqual(
    { code, summary, rows },
    {
      code: 0,
      summary: ["🟢 no FACT check recorded a blocking finding", NOTE],
      rows: [
        "render-paper/report-submission ABSTAINED input-missing",
        "render-paper/report-submission-citations ABSTAINED no-witness",
        "tighten-paper/structure ABSTAINED no-witness",
        "grade-paper-writing/prose-lint ABSTAINED no-witness",
        "verify-citations/verify-cites ABSTAINED no-witness",
        "harden-paper/artifact-coverage ABSTAINED no-witness",
        "build-benchmark/check-provenance ABSTAINED no-witness",
        "build-benchmark/arm-permutation ABSTAINED input-missing",
        "build-benchmark/delivered-pdf ABSTAINED input-missing",
        "build-benchmark/generated-code ABSTAINED no-witness",
        "grade-paper-writing/textidote ABSTAINED input-missing",
        "verify-citations/uncited-refs ABSTAINED input-missing",
        "draft-paper/population-map ABSTAINED no-witness",
        "tighten-paper/round-diff ABSTAINED input-missing",
      ],
    },
  );
});

test("the prose-lint row records the number of findings prose-lint found, not its line count", () => {
  const row = run(join(consumer, "papers", "c"), {
    FAKE_PROSE_REAL: "1",
  }).rows.find((x) => x.startsWith("grade-paper-writing/prose-lint "));
  assert.equal(row, "grade-paper-writing/prose-lint FINDING 2");
});

test("no directory argument means the current directory", () => {
  const { code, out, rows } = run(undefined);
  assert.deepEqual(
    { code, out, rows },
    { code: 2, out: `stderr: no paper.md in ${process.cwd()}`, rows: [] },
  );
});

test("a blocking finding with no output still gets a report a reader can open", () => {
  const r = run(join(consumer, "papers", "a"), { FAKE_REPORT_EXIT: "1" });
  const report = readFileSync(
    join(
      consumer,
      "papers",
      "a",
      "reviews",
      "mechanical",
      "render-paper--report-submission.md",
    ),
    "utf8",
  ).replace(/^created: .*$/m, "created: <date>");
  assert.deepEqual(
    { row: r.rows[0], report },
    {
      row: "render-paper/report-submission FINDING 1 blocking",
      report: [
        "---",
        'title: "render-paper/report-submission — mechanical check output"',
        "created: <date>",
        "findings: 1",
        "---",
        "",
        "Written by `run-mechanical.mjs`. What this check looks at: body pages, overfull boxes, unresolved refs, dropped characters, anonymity, artifact URLs",
        "",
        "```",
        "(the check produced no output)",
        "```",
        "",
      ].join("\n"),
    },
  );
});

test("an empty $TEXTIDOTE_JAR is no declaration: the row looks at /opt/textidote, like the checker", () => {
  // The answer depends on this machine (some images ship the jar in /opt), so the expectation is
  // derived from the same fact the row reads rather than hard-coded.
  const atOpt = existsSync("/opt/textidote/textidote.jar");
  const row = run(join(consumer, "papers", "a"), {
    TEXTIDOTE_JAR: "",
    FAKE_TEXTIDOTE: "[]",
  }).rows.find((x) => x.startsWith("grade-paper-writing/textidote "));
  assert.equal(
    row,
    `grade-paper-writing/textidote ABSTAINED ${atOpt ? "no-witness" : "input-missing"}`,
  );
});
