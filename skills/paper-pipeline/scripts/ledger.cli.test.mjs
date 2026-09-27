/**
 * ledger.mjs — the `record`/`status` CLI every wired skill ends with, the refusals `record` makes,
 * the evidence contract on a FINDING, and how rows from the retired vocabulary and rows out of
 * time order are read. The ledger and the consumer are temp paths, set before import.
 *
 * Refusal messages are several lines of explanation; where the wording is not the subject, the
 * FIRST line (which names the defect) and the exit code are compared.
 */
import assert from "node:assert/strict";
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "ledger.mjs");
const root = useTempDir("ledger-cli-");
const consumer = join(root, "consumer");
const LEDGER = join(root, "runs.jsonl");
const paper = join(consumer, "papers", "p");
writeTree(paper, {
  "paper.md": "# P\n\ntext\n",
  "counted.md": "---\nfindings: 2\n---\n",
  "uncounted.md": "no frontmatter count\n",
});
cpSync(
  join(HERE, "..", "..", "cold-read-diff"),
  join(consumer, ".claude", "skills", "cold-read-diff"),
  {
    recursive: true,
    verbatimSymlinks: true,
  },
);
const env = { CLAUDE_PROJECT_DIR: consumer, PIPELINE_LEDGER: LEDGER };
Object.assign(process.env, env);
const { readLedger, record, status } = await import("./ledger.mjs");
afterEach(() => rmSync(LEDGER, { force: true }));

const cli = (...args) => runNode(SCRIPT, args, { env });
const firstLine = (s) => s.trim().split("\n")[0];
const kinds = () =>
  readLedger().map((r) => `${r.kind} ${r.findings} ${r.blocking}`);

test("record FINDING with a report that states the same count: one row, printed, exit 0", () => {
  const r = cli(
    "record",
    "cold-read-diff",
    paper,
    "FINDING",
    "2",
    "counted.md",
    "--blocking",
    "--check=sub",
  );
  const row = JSON.parse(r.stdout);
  assert.deepEqual(
    { status: r.status, stderr: r.stderr, check: row.check, kinds: kinds() },
    { status: 0, stderr: "", check: "sub", kinds: ["FINDING 2 true"] },
  );
});

test("the evidence contract: no path, a path to nothing, a disagreeing count — recorded, then exit 1", () => {
  const cases = [
    ["FINDING", "2"],
    ["FINDING", "2", "missing.md"],
    ["FINDING", "3", "counted.md"],
  ].map((args) => {
    const r = cli("record", "cold-read-diff", paper, ...args);
    return [r.status, firstLine(r.stderr)];
  });
  assert.deepEqual(
    { cases, kinds: kinds() },
    {
      cases: [
        [1, "🔴 cold-read-diff: recorded 2 finding(s) with NO report path."],
        [
          1,
          '🔴 cold-read-diff: recorded report path "missing.md" — nothing is there.',
        ],
        [
          1,
          "🔴 cold-read-diff: the ledger says 3 finding(s), counted.md says 2.",
        ],
      ],
      kinds: ["FINDING 2 false", "FINDING 2 false", "FINDING 3 false"],
    },
  );
});

test("a report that states no count is only a nudge: recorded, exit 0", () => {
  const r = cli(
    "record",
    "cold-read-diff",
    paper,
    "FINDING",
    "1",
    "uncounted.md",
  );
  assert.deepEqual(
    { status: r.status, nudge: firstLine(r.stderr) },
    {
      status: 0,
      nudge:
        "⚠️  cold-read-diff: uncounted.md does not state its own finding count.",
    },
  );
});

test("refusals before writing: a retired kind, an unknown kind, a free-text reason, a finding of zero", () => {
  const cases = [
    ["PASS"],
    ["probably fine"],
    ["ABSTAINED", "looked fine"],
    ["FINDING", "0", "counted.md"],
    ["ABSTAINED", "no-witness", "a note"],
  ].map((args) => {
    const r = cli("record", "cold-read-diff", paper, ...args);
    return [
      r.status,
      r.status === 0 ? JSON.parse(r.stdout).reason : firstLine(r.stderr),
    ];
  });
  assert.deepEqual(
    { cases, kinds: kinds() },
    {
      cases: [
        [
          2,
          '🔴 "PASS" is not a verdict any more — deleted: it stored "nothing was wrong" as a value. Record ABSTAINED `no-witness`, and let the reader derive cleanliness from the absence of findings.',
        ],
        [2, '🔴 kind must be one of FINDING|ABSTAINED, got "probably fine"'],
        [
          2,
          '🔴 ABSTAINED needs a reason from started|no-witness|input-missing|blocked|crashed, got "looked fine".',
        ],
        [
          2,
          "🔴 FINDING with findings=0. A finding of nothing is an abstention:",
        ],
        [0, "no-witness"],
      ],
      // Only the valid abstention was written.
      kinds: ["ABSTAINED 0 false"],
    },
  );
});

test("status prints the derived rows; no command prints the usage and exits 2", () => {
  cli("record", "cold-read-diff", paper, "ABSTAINED", "no-witness");
  const s = cli("status", paper);
  const u = cli();
  assert.deepEqual(
    {
      status: s.status,
      rows: JSON.parse(s.stdout).map((r) => [r.key, r.state, r.runs]),
      usage: [u.status, firstLine(u.stderr)],
    },
    {
      status: 0,
      rows: [["cold-read-diff", "FRESH", 1]],
      usage: [
        2,
        "usage: ledger.mjs record <skill> <paperDir> FINDING   <count> <report-path> [--check=<id>] [--blocking]",
      ],
    },
  );
});

test("status with no paper argument reads the current directory", () => {
  const r = runNode(SCRIPT, ["status"], { env, cwd: paper });
  assert.deepEqual([r.status, JSON.parse(r.stdout)], [0, []]);
});

test("retired rows are read as LEGACY, keep their word, and only FINDINGS/FAIL carry a count", () => {
  const legacy = (verdict, extra = {}) =>
    JSON.stringify({
      ts: "2026-08-01T00:00:00Z",
      skill: "old-skill",
      paper: "p",
      verdict,
      ...extra,
    });
  writeFileSync(
    LEDGER,
    [
      legacy("PASS"),
      legacy("FINDINGS", { findings: "4" }),
      legacy("FAIL"),
      legacy(undefined),
      "not json at all",
      "",
    ].join("\n"),
  );
  assert.deepEqual(
    readLedger().map((r) => [
      r.kind,
      r.check,
      r.legacyVerdict,
      r.findings,
      r.blocking,
    ]),
    [
      ["LEGACY", "old-skill", "PASS", 0, false],
      ["LEGACY", "old-skill", "FINDINGS", 4, false],
      ["LEGACY", "old-skill", "FAIL", 0, true],
      ["LEGACY", "old-skill", null, 0, false],
    ],
  );
});

test("the latest run is chosen by timestamp; a stamped row beats unstamped ones; unstamped fall back to file order", () => {
  const row = (ts, findings) =>
    JSON.stringify({
      ...(ts ? { ts } : {}),
      skill: "cold-read-diff",
      paper: "p",
      kind: findings ? "FINDING" : "ABSTAINED",
      findings,
      reason: findings ? null : "no-witness",
      report: findings ? "counted.md" : null,
    });
  const latest = (...lines) => {
    writeFileSync(LEDGER, lines.join("\n") + "\n");
    return status(paper)[0].findings;
  };
  assert.deepEqual(
    [
      latest(row("2026-09-02T00:00:00Z", 2), row("2026-09-01T00:00:00Z", 0)),
      latest(row(null, 0), row("2026-09-01T00:00:00Z", 2), row(null, 0)),
      latest(row(null, 2), row(null, 0)),
      latest(row(null, 0), row(null, 2)),
    ],
    [2, 2, 0, 2],
  );
});

test("record straight from code returns the row it wrote", () => {
  const row = record({
    skill: "cold-read-diff",
    paper,
    kind: "ABSTAINED",
    reason: "blocked",
  });
  assert.deepEqual(
    [row.kind, row.reason, row.check, row.paper, readLedger().length],
    ["ABSTAINED", "blocked", "cold-read-diff", "p", 1],
  );
});

test("status over hand-edited and retired rows: a bare FINDING, and a legacy FINDINGS that still counts", () => {
  writeFileSync(
    LEDGER,
    [
      {
        ts: "2026-09-01T00:00:00Z",
        skill: "hand",
        paper: "p",
        kind: "FINDING",
      },
      {
        ts: "2026-08-01T00:00:00Z",
        skill: "old-skill",
        paper: "p",
        verdict: "FINDINGS",
        findings: 4,
        report: "r.md",
      },
      {
        ts: "2026-08-01T00:00:00Z",
        skill: "failed-skill",
        paper: "p",
        verdict: "FAIL",
        findings: 1,
      },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n",
  );
  assert.deepEqual(
    status(paper, { gates: ["hand", "old-skill", "failed-skill"] }).map((r) => [
      r.key,
      r.findings,
      r.report,
      r.legacy,
      r.everFound,
    ]),
    [
      ["hand", 0, null, null, true],
      ["old-skill", 4, "r.md", "FINDINGS", true],
      ["failed-skill", 1, null, "FAIL", true],
    ],
  );
});

test("record FINDING with no count at all is a finding of zero, refused", () => {
  const r = cli("record", "cold-read-diff", paper, "FINDING");
  assert.deepEqual(
    [r.status, firstLine(r.stderr)],
    [2, "🔴 FINDING with findings=0. A finding of nothing is an abstention:"],
  );
});
