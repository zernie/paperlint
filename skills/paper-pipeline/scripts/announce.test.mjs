/**
 * announce.mjs — the first line of every wired skill's `## Run me` block: a banner on stderr naming
 * the paper and skill versions, and a `started` abstention in the ledger. Run as the skills run it,
 * against a temp consumer and a temp ledger.
 */
import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "announce.mjs");
const root = useTempDir("announce-");
const consumer = join(root, "consumer");
const LEDGER = join(root, "runs.jsonl");
writeTree(root, { "consumer/papers/p/paper.md": "# P\n\ntext\n" });
cpSync(
  join(HERE, "..", "..", "cold-read-diff"),
  join(consumer, ".claude", "skills", "cold-read-diff"),
  {
    recursive: true,
    verbatimSymlinks: true,
  },
);
const env = { CLAUDE_PROJECT_DIR: consumer, PIPELINE_LEDGER: LEDGER };
process.env.CLAUDE_PROJECT_DIR = consumer;
process.env.PIPELINE_LEDGER = LEDGER;
const { inputHash, skillHash } = await import("./ledger.mjs");

const rows = () =>
  readFileSync(LEDGER, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .map(({ skill, check, paper, kind, reason, note }) => ({
      skill,
      check,
      paper,
      kind,
      reason,
      note,
    }));
afterEach(() => rmSync(LEDGER, { force: true }));

test("no skill name: the usage line, exit 2, nothing recorded", () => {
  assert.deepEqual(runNode(SCRIPT, [], { env }), {
    status: 2,
    stdout: "",
    stderr: "usage: announce.mjs <skill-name> [paper-dir]\n",
  });
});

test("a skill on a paper: the banner names both versions, and a `started` row is recorded", () => {
  const paper = join(consumer, "papers", "p");
  const r = runNode(SCRIPT, ["cold-read-diff", paper], { env });
  assert.deepEqual(
    { ...r, rows: rows() },
    {
      status: 0,
      stdout: "",
      stderr:
        "▶ cold-read-diff  —  p\n" +
        `  paper ${inputHash(paper).slice(0, 8)} · skill ${skillHash("cold-read-diff").slice(0, 8)}\n`,
      rows: [
        {
          skill: "cold-read-diff",
          check: "cold-read-diff",
          paper: "p",
          kind: "ABSTAINED",
          reason: "started",
          note: "no verdict recorded yet",
        },
      ],
    },
  );
});

test("no paper directory and an unknown skill still announce, with placeholders", () => {
  const r = runNode(SCRIPT, ["no-such-skill", join(root, "nowhere")], { env });
  assert.deepEqual(
    { status: r.status, stderr: r.stderr, kind: rows()[0].kind },
    {
      status: 0,
      stderr:
        "▶ no-such-skill  —  no paper dir\n  paper (none) · skill ????????\n",
      kind: "ABSTAINED",
    },
  );
});

test("no paper argument means the current directory", () => {
  const r = runNode(SCRIPT, ["cold-read-diff"], {
    env,
    cwd: join(consumer, "papers", "p"),
  });
  assert.deepEqual(
    { status: r.status, firstLine: r.stderr.split("\n")[0] },
    { status: 0, firstLine: "▶ cold-read-diff  —  p" },
  );
});
