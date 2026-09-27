/**
 * The derivation of a consumer's public module paths, on inputs built here: what the install e2e
 * imports is only as complete as these two functions are.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import {
  documentedSpecifiers,
  importSpecifiers,
  modulePaths,
} from "./e2e/public-paths.ts";

test("static, re-exported and dynamic imports are all found; comments and strings are not", () => {
  assert.deepEqual(
    importSpecifiers(
      [
        'import { a } from "paperlint/bin/paperlint.mjs";',
        'export { b } from "paperlint/lib/x.mjs";',
        'const c = await import("paperlint/eslint-rules/y.mjs");',
        '// import "paperlint/not-this.mjs";',
        'const s = "paperlint/nor-this.mjs";',
      ].join("\n"),
    ),
    [
      "paperlint/bin/paperlint.mjs",
      "paperlint/lib/x.mjs",
      "paperlint/eslint-rules/y.mjs",
    ],
  );
});

test("only code blocks count, only JavaScript/TypeScript ones, only the package's own paths", () => {
  const md = [
    'Prose that says import "paperlint/prose.mjs" is not code.',
    "```js",
    'import { t } from "paperlint/eslint-rules/latex-language.mjs";',
    'import x from "eslint";',
    "```",
    "```bash",
    "node -e 'import(\"paperlint/shell.mjs\")'",
    "```",
    "```ts title=eslint.config.ts",
    'import { r } from "paperlint/bin/paperlint.mjs";',
    "```",
  ].join("\n");
  assert.deepEqual(documentedSpecifiers(md), [
    "paperlint/eslint-rules/latex-language.mjs",
    "paperlint/bin/paperlint.mjs",
  ]);
});

test("module paths: compiled and not-yet-converted modules, tests and declarations excluded", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "public-paths-")));
  const put = (rel: string): void => {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), "");
  };
  put("dist/lib/markdown.js");
  put("dist/lib/markdown.d.ts");
  put("lib/trigger-ledger.mjs");
  put("lib/trigger-ledger.harness.mjs");
  put("lib/markdown.test.mjs");
  put("dist/eslint-rules/latex-language.js");
  assert.deepEqual(modulePaths(root), [
    "paperlint/lib/markdown.mjs",
    "paperlint/lib/trigger-ledger.mjs",
    "paperlint/eslint-rules/latex-language.mjs",
  ]);
  // A package with neither directory ships no module paths, rather than throwing.
  assert.deepEqual(
    modulePaths(
      realpathSync(mkdtempSync(join(tmpdir(), "public-paths-empty-"))),
    ),
    [],
  );
});
