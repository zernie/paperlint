/**
 * paper-skills-nudge on the two declarations the hooks harness does not carry: none at all (the
 * default `papers/` root applies) and one that does not parse (silence — a nudge never blocks).
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import { hookConsumer, onEdit, runShippedHook } from "../test/hook-consumer.ts";
import { useTempDir } from "../test/support.ts";

const root = useTempDir("paper-skills-nudge-");

test("no paperlint.json: an edit to papers/<p>/paper.tex gets the checklist", () => {
  const dir = hookConsumer(join(root, "default"));
  const r = runShippedHook(
    "paper-skills-nudge",
    onEdit("papers/alpha/paper.tex"),
    dir,
  );
  assert.equal(r.exitCode, 0);
  assert.notEqual(r.stdout, "");
});

test("a paperlint.json that does not parse: silent, exit 0", () => {
  const dir = hookConsumer(join(root, "broken"), {
    "paperlint.json": "{ nope",
  });
  const r = runShippedHook(
    "paper-skills-nudge",
    onEdit("papers/alpha/paper.tex"),
    dir,
  );
  assert.deepEqual([r.exitCode, r.stdout, r.stderr], [0, "", ""]);
});

test("an edit to papers/<p>/paper.md is not a paper edit: silent", () => {
  const dir = hookConsumer(join(root, "markdown"));
  const r = runShippedHook(
    "paper-skills-nudge",
    onEdit("papers/alpha/paper.md"),
    dir,
  );
  assert.deepEqual([r.exitCode, r.stdout, r.stderr], [0, "", ""]);
});
