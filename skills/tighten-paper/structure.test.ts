/**
 * structure.mjs — the section inventory the tighten-paper skill prints for a human to read. No
 * threshold, no finding: the table IS the product, so the whole printed table is compared.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../test/support.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "structure.mjs");
const root = useTempDir("structure-");
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `w${String(i)}`).join(" ");

writeTree(root, {
  // Every row shape: a sub-section before any section, carries notes with a score and a verdict,
  // with only one of them, with neither, a numbered section with no note, and a free half — after
  // Limitations, between References and the Appendix — larger than the body.
  "full.md": `---
title: x
---
Preamble before any heading.

### Orphan sub
${words(3)}

<!-- carries: the claim · score: 7/10 · verdict: keep -->
## 1 Introduction
${words(10)}

<!-- carries: a sub-point -->
### 1.1 Detail
${words(4)}

### 1.2 Bare sub
${words(2)}

## 2 Method
${words(6)}

<!-- carries: only a verdict · verdict: CUT -->
## 3 Results
${words(5)}

<!-- carries: score only · score: 4 -->
## Discussion
${words(3)}

## Limitations
${words(40)}

<!-- carries: why the scope note -->
### Scope
${words(5)}

## References
[1] Not counted.

<!-- carries: the raw tables -->
## Appendix A
${words(30)}
`,
  // References come first, so the free half runs from it to the end; no appendix.
  "refs-first.md": `## 1 Intro\n${words(8)}\n\n## References\n[1] x\n\n## Ethical note\n${words(2)}\n`,
  // Limitations then References and no appendix: the free half stops at References.
  "no-appendix.md": `## 1 Intro\n${words(8)}\n\n## Limitations\n${words(3)}\n\n## References\n[1] x\n`,
  // No free half at all.
  // ...and a section with no words at all.
  "body-only.md": `## 1 Intro\n${words(8)}\n\n## 2 Rest\n${words(4)}\n\n## 3 Empty\n`,
});

const run = (...args: string[]) => {
  const r = runNode(
    SCRIPT,
    args.map((a) => (a.startsWith("--") ? a : join(root, a))),
  );
  return { ...r, stdout: r.stdout.replaceAll(root, "<root>") };
};

test("no file: the usage line, exit 0", () => {
  assert.deepEqual(run(), {
    status: 0,
    stdout: "",
    stderr:
      "usage: node structure.mjs <paper.md> [--section=N]   (--flags-only is accepted and stays silent)\n",
  });
});

test("--flags-only stays silent and exits 0 — every check moved to ESLint", () => {
  assert.deepEqual(run("--flags-only", "full.md"), {
    status: 0,
    stdout: "",
    stderr: "",
  });
});

test.each(["full.md", "refs-first.md", "no-appendix.md", "body-only.md"])(
  "the inventory of %s",
  (file) => {
    const r = run(file);
    assert.deepEqual(
      { status: r.status, stderr: r.stderr },
      { status: 0, stderr: "" },
    );
    expect(r.stdout).toMatchSnapshot();
  },
);

test("--section=1 keeps section 1 and its sub-sections, and nothing before it", () => {
  const r = run("full.md", "--section=1");
  assert.deepEqual(
    { status: r.status, stderr: r.stderr },
    { status: 0, stderr: "" },
  );
  expect(r.stdout).toMatchSnapshot();
});
