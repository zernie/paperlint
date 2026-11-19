/**
 * paper-status-gates on the two declarations the hooks harness does not carry: none at all (the
 * default `papers/` root applies) and one that does not parse (silence — this hook never blocks).
 * Then the report of unrun gates: it fires on a planted ☐ and stays quiet on a clean or closed status.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import { hookConsumer, onEdit, runShippedHook } from "../test/hook-consumer.ts";
import { useTempDir } from "../test/support.ts";

const root = useTempDir("paper-status-gates-");
const STATUS = "**Readiness verdict:** ✅ fixture verdict line\n";

test("no paperlint.json: an edit under papers/ runs the gates for that paper", () => {
  const dir = hookConsumer(join(root, "default"), {
    "papers/alpha/PIPELINE-STATUS.md": STATUS,
  });
  const r = runShippedHook(
    "paper-status-gates",
    onEdit("papers/alpha/paper.tex"),
    dir,
  );
  assert.equal(r.exitCode, 0);
  assert.match(r.stderr, /fixture verdict line/);
});

test("a paperlint.json that does not parse: silent, exit 0", () => {
  const dir = hookConsumer(join(root, "broken"), {
    "paperlint.json": "{ nope",
    "papers/alpha/PIPELINE-STATUS.md": STATUS,
  });
  const r = runShippedHook(
    "paper-status-gates",
    onEdit("papers/alpha/paper.tex"),
    dir,
  );
  assert.deepEqual([r.exitCode, r.stdout, r.stderr], [0, "", ""]);
});

test("an edit to a file of the paper other than its source: no gates run", () => {
  const dir = hookConsumer(join(root, "not-a-source"), {
    "papers/alpha/PIPELINE-STATUS.md": STATUS,
  });
  const r = runShippedHook(
    "paper-status-gates",
    onEdit("papers/alpha/notes.txt"),
    dir,
  );
  assert.deepEqual([r.exitCode, r.stdout, r.stderr], [0, "", ""]);
});

/** A status file with the verdict line and the given GATES rows. */
const statusWith = (...rows: readonly string[]): string =>
  [
    STATUS,
    "| id | Gate | Skill | Requires | Status | Date | Result | Open |",
    "| -- | ---- | ----- | -------- | ------ | ---- | ------ | ---- |",
    ...rows,
    "",
  ].join("\n");

const gatesOf = (name: string, status: string) =>
  runShippedHook(
    "paper-status-gates",
    onEdit("papers/alpha/paper.tex"),
    hookConsumer(join(root, name), {
      "papers/alpha/PIPELINE-STATUS.md": status,
    }),
  );

test("unrun gates are reported with their owner, and nothing orders a rerun", () => {
  const r = gatesOf(
    "unrun",
    statusWith(
      "| panel | Review decision | pc-panel-review | structure, coldread | ☐ | — | — | — |",
      "| harden | Submit checklist | harden-paper | panel, cites | ☐ | — | — | — |",
    ),
  );
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.stderr.split("\n").slice(1), [
    "📋 Not run yet in papers/alpha/PIPELINE-STATUS.md (☐):",
    '   panel — the final review, once (paper-pipeline, "The final review")',
    "   harden — the submit checklist (harden-paper)",
    "",
  ]);
});

test("a clean status and a closed final review report no gate", () => {
  const r = gatesOf(
    "closed",
    statusWith(
      "| panel | Review decision | pc-panel-review | structure, coldread | ☑ closed 2026-11-19 | 2026-11-19 | weak accept | — |",
      "| harden | Submit checklist | harden-paper | panel, cites | ☑ | 2026-11-19 | ready | — |",
    ),
  );
  assert.deepEqual(
    [r.exitCode, r.stderr],
    [0, "📊 Readiness verdict: ✅ fixture verdict line\n"],
  );
});
