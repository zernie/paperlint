/**
 * `scripts/run-tests.ts` — the unit-test tier of `npm test`. What matters is that it cannot report
 * a pass for a run in which nothing ran, and that a failing test file fails it.
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runUnitTests, unitTestFiles } from "./run-tests.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** A throwaway tree holding `files` ({ relativePath: content }), removed after `use`. */
function inTree(files: Record<string, string>, use: (dir: string) => void) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rpp-unit-")));
  try {
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the real tree has unit tests, and this file is one of them", () => {
  // Guards: discovery — the runner finds the repository's tests, not an empty set.
  const found = unitTestFiles(ROOT);
  assert.ok(found.includes("scripts/run-tests.test.ts"), found.join("\n"));
  assert.ok(found.includes("scripts/harness-api.test.ts"));
});

test("🔴 zero matching files is a FAILURE, not a pass", () => {
  inTree({ "src/a.ts": "export const a = 1;\n" }, (dir) => {
    const files = unitTestFiles(dir);
    assert.deepEqual(files, []);
    // Guards: the green zero `node --test` has on its own (exit 0 with `# tests 0`).
    assert.equal(runUnitTests(dir, files), 1);
  });
});

test("a failing test file fails the run; a passing one passes; node_modules is not searched", () => {
  const files = {
    "ok.test.ts": "import assert from 'node:assert'; assert.ok(true);\n",
    "bad.test.mjs": "import assert from 'node:assert'; assert.ok(false);\n",
    "node_modules/x/dep.test.mjs": "process.exit(1);\n",
  };
  inTree(files, (dir) => {
    // Guards: dependencies' own tests are not ours to run.
    assert.deepEqual(unitTestFiles(dir), ["bad.test.mjs", "ok.test.ts"]);
    // Guards: a red test file turns the tier red.
    assert.equal(runUnitTests(dir, ["bad.test.mjs"]), 1);
    assert.equal(runUnitTests(dir, ["ok.test.ts"]), 0);
  });
});
