/**
 * The layer configuration, linted on a fixture tree: real files under `test/fixtures/layers/src/`,
 * one per case, each declaring on line 1 the rule ids it must produce (`// expect: <ids>`) or that
 * it must produce none (`// expect: clean`). The configuration is the repository's own
 * `eslint.config.mjs`, with only the layer block re-rooted at the fixture — so a change to the real
 * layer rules is what this test sees.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import config, { layerBoundaries } from "../eslint.config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "layers");

/** The real configuration, with the block that carries the boundaries plugin re-rooted at `root`. */
const configRootedAt = (root: string) =>
  config.map((block) =>
    block.plugins && "boundaries" in block.plugins
      ? layerBoundaries(root)
      : block,
  );

/** What a fixture file's first line says it must produce. */
function expected(file: string): string[] {
  const first = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";
  const m = /^\/\/ expect: (.+)$/.exec(first);
  assert.ok(
    m,
    `${file}: line 1 must be "// expect: <rule ids>" or "// expect: clean"`,
  );
  const ids = (m[1] ?? "").trim();
  return ids === "clean" ? [] : ids.split(/\s+/).sort();
}

test("every fixture file produces exactly the rule ids its first line expects", async () => {
  const eslint = new ESLint({
    cwd: FIXTURE,
    overrideConfigFile: true,
    overrideConfig: configRootedAt(FIXTURE),
  });
  const results = await eslint.lintFiles(["src"]);
  // Guards: a glob that matched nothing lints nothing and reports clean — the fixture must be seen.
  assert.ok(results.length >= 24, `linted ${results.length} fixture files`);
  for (const r of results) {
    const got = [
      ...new Set(r.messages.map((x) => x.ruleId ?? "(fatal)")),
    ].sort();
    assert.deepEqual(
      got,
      expected(r.filePath),
      `${relative(FIXTURE, r.filePath)}: ${r.messages.map((x) => x.message).join(" | ")}`,
    );
  }
});
