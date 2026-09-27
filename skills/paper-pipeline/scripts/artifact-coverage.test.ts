/**
 * artifact-coverage.mjs on the inputs its harness does not build: no argument, no markdown paper,
 * a free-section heading on the paper's very first line, a numbered section without subsections,
 * an index naming the same path twice / a glob / a URL / a repro path, no repro/ at all, a
 * grandfather row without a reason, and a plain file among the repro/ entries.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "artifact-coverage.mjs",
);
const root = useTempDir("artifact-coverage-");
const run = (...args: string[]) => runNode(SCRIPT, args);

test("no argument prints the usage; a paper with no markdown source is a named skip", () => {
  assert.deepEqual(run(), {
    status: 0,
    stdout: "",
    stderr: "usage: node artifact-coverage.mjs <paper-dir> [--flags-only]\n",
  });
  const tex = writeTree(join(root, "tex"), { "paper.tex": "x" });
  const r = run(tex);
  assert.equal(r.status, 0);
  assert.match(
    r.stderr,
    /artifact coverage SKIPPED for .* — no paper\.md\/draft\.md/,
  );
});

test("a section without subsections is checked against its own number; the index's odd paths are passed over", () => {
  const dir = writeTree(join(root, "odd"), {
    "paper.md": "## 3. Results\n\nWe measured **42 %** of runs.\n",
    "artifact/README.md": [
      "Section 7 only.",
      "`data/rows.tsv` and again `data/rows.tsv`",
      "`runs/*/out.json`",
      "`https://example.org/x.json`",
      "`repro/work/tmp.json`",
    ].join("\n"),
  });
  const r = run(dir);
  assert.match(
    r.stdout,
    /§3 reports 1 bolded figure\(s\) and is named NOWHERE/,
  );
  assert.match(
    r.stdout,
    /the index names `data\/rows\.tsv` and `data` is not in the bundle/,
  );
  assert.equal(r.stdout.match(/rows\.tsv/g)?.length, 1);
  assert.doesNotMatch(r.stdout, /out\.json|example\.org|tmp\.json/);
  assert.match(
    r.stdout,
    /reverse check \(results on disk nobody reports\): SKIPPED — no repro\/ directory/,
  );
});

test("a free-section heading on the first line does not end the body at offset 0", () => {
  const dir = writeTree(join(root, "first-line"), {
    "paper.md": "## Limitations\n\nNone.\n\n## 2. Method\n\nIt took **9 s**.\n",
    "artifact/README.md": "nothing\n",
  });
  assert.match(run(dir).stdout, /§2 reports 1 bolded figure\(s\)/);
});

test("repro/: a plain file is not a candidate, a dot-directory is swallowed and named; a grandfather row with no reason says so", () => {
  const dir = writeTree(join(root, "grandfathered"), {
    "paper.md": "## 1. Intro\n\nText.\n",
    "artifact/README.md": "§1\n",
    "repro/notes.txt": "a file, not an analysis",
    "repro/.cache/RESULTS.md": "a dot-directory, swallowed before counting",
    "repro/old-run/RESULTS.md": "done\n",
    "repro/unreported-grandfathered.txt": "old-run\n",
  });
  const out = run(dir).stdout;
  assert.match(out, / {7}old-run {2}→ {2}\(NO REASON GIVEN\)/);
  assert.match(
    out,
    /• 1 before they were counted — dot-directories and build\/dependency trees[^\n]*\n {7}\.cache/,
  );
});
