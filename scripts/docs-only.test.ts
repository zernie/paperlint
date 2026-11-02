/**
 * The docs-only gate (`docs-only.ts`): it says yes only when every changed path is documentation,
 * and no on code, on a shipped SKILL.md, on CI itself and on an empty list.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { docsOnly, isDoc, main } from "./docs-only.ts";

test("a root Markdown file and anything Markdown under docs/ are documentation", () => {
  assert.deepEqual(
    ["README.md", "docs/website.md", "docs/prior-art/README.md"].map(isDoc),
    [true, true, true],
  );
});

test("code, a shipped SKILL.md, CI and non-Markdown under docs/ are not", () => {
  assert.deepEqual(
    [
      "src/build.ts",
      "skills/paper-pipeline/SKILL.md",
      ".github/workflows/ci.yml",
      ".github/CLAUDE.md",
      "docs/prior-art/repro/run.py",
      "presets/acm.jsonc",
    ].map(isDoc),
    [false, false, false, false, false, false],
  );
});

test("docs-only needs every path to be documentation", () => {
  assert.equal(docsOnly(["README.md", "docs/website.md"]), true);
  assert.equal(docsOnly(["docs/website.md", "src/build.ts"]), false);
});

test("an empty list is not docs-only: nothing read is no reason to skip", () => {
  assert.equal(docsOnly([]), false);
  assert.equal(main(""), "docs_only=false");
});

test("main reads one path per line, ignoring blanks and surrounding space", () => {
  assert.equal(main("docs/website.md\n\n  README.md \n"), "docs_only=true");
  assert.equal(
    main("docs/website.md\nscripts/docs-only.ts\n"),
    "docs_only=false",
  );
});

test("run as a program, it reads stdin and prints the GITHUB_OUTPUT line", () => {
  const r = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./docs-only.ts", import.meta.url))],
    { input: "docs/website.md\n", encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "docs_only=true\n");
});
