/**
 * paper-skills-nudge on the declarations the hooks harness does not carry: none at all (the
 * default `papers/` root applies) and one that does not parse (silence — a nudge never blocks).
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import { hookConsumer, onEdit, runShippedHook } from "../test/hook-consumer.ts";
import { useTempDir } from "../test/support.ts";
import { message, paperOf, skillLines } from "./paper-skills-nudge.hook.mjs";

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

test("a file directly under the papers root belongs to no paper: silent", () => {
  const dir = hookConsumer(join(root, "root-file"));
  const r = runShippedHook(
    "paper-skills-nudge",
    onEdit("papers/README.md"),
    dir,
  );
  assert.deepEqual([r.exitCode, r.stdout, r.stderr], [0, "", ""]);
});

test("any file of a paper, not only its source: the checklist", () => {
  const dir = hookConsumer(join(root, "any-file"));
  const r = runShippedHook(
    "paper-skills-nudge",
    onEdit("papers/alpha/notes.txt"),
    dir,
  );
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /Working on paper \\"alpha\\"/);
});

// ── the pure helpers, on the inputs the shipped run never sends ─────────────────────────────

test("skillLines: a missing provider result is no skills, not a crash", () => {
  assert.deepEqual(skillLines(undefined), []);
});

test("skillLines: a line that is not a skill name is dropped; a name without a description stays", () => {
  assert.deepEqual(skillLines("Not A Name\tx\nbare-name"), [
    "  • bare-name — ",
  ]);
});

test("skillLines: a quoted description is unquoted and cut at its first clause, at most 110 characters", () => {
  const long = "a".repeat(200);
  assert.deepEqual(
    skillLines(`quoted\t"Say \\"hi\\" — then more"\nlong\t${long}`),
    ['  • quoted — Say "hi"', `  • long — ${"a".repeat(107)}...`],
  );
});

test("paperOf: only a file inside a paper folder belongs to a paper", () => {
  assert.deepEqual(
    [
      paperOf([undefined], "papers"),
      paperOf(["elsewhere/alpha/x.tex"], "papers"),
      paperOf(["papers/README.md"], "papers"),
      paperOf(["papers/alpha/x.tex"], "papers/"),
    ],
    [null, null, null, "alpha"],
  );
});

test("message: with no skills found, the list is left out and the rest stays", () => {
  const m = message("alpha", []);
  assert.equal(m.includes("shipped with this package"), false);
  assert.match(m, /RULES earned the hard way/);
});

test("paperOf: the root in any spelling the path check accepts — ./, doubled slashes, absolute", () => {
  assert.deepEqual(
    [
      paperOf(["papers/alpha/x.tex"], "./papers"),
      paperOf(["papers/alpha/x.tex"], ".//papers//"),
      paperOf(
        ["papers/alpha/x.tex", "/repo/papers/alpha/x.tex"],
        "/repo/papers",
      ),
      paperOf(["papers/README.md", "/repo/papers/README.md"], "/repo/papers"),
    ],
    ["alpha", "alpha", "alpha", null],
  );
});

test("a ./-spelled papersDir: the checklist still lands", () => {
  const dir = hookConsumer(join(root, "dot-slash"), {
    "paperlint.json": JSON.stringify({ papersDir: "./papers" }),
  });
  const r = runShippedHook(
    "paper-skills-nudge",
    onEdit("papers/alpha/paper.tex"),
    dir,
  );
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /Working on paper/);
});
