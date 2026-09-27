/**
 * paper-status-gates on the two declarations the hooks harness does not carry: none at all (the
 * default `papers/` root applies) and one that does not parse (silence — this hook never blocks).
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
    onEdit("papers/alpha/paper.md"),
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
    onEdit("papers/alpha/paper.md"),
    dir,
  );
  assert.deepEqual([r.exitCode, r.stdout, r.stderr], [0, "", ""]);
});
