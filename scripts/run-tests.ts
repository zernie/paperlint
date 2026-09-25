#!/usr/bin/env node
/**
 * `npm test` — every test tier, one command.
 *
 *   1. `vigiles test --min=1` — the `*.harness.*` files: tests of the AGENT surface, which import
 *      vigiles' `runHook` / `runHarnessTest` / `runEval` (`scripts/harness-api.test.ts` holds that).
 *   2. `tsc -p tsconfig.test.json` — the TypeScript tests are type-checked, not only type-stripped.
 *   3. `node --test` — every `*.test.ts` / `*.test.mjs`: plain unit tests.
 *
 * Arguments go to `vigiles test` (CI runs `npm test -- --no-skip`). Every tier runs, so a failure in
 * one does not hide the next; the exit code is nonzero if any failed.
 *
 * 🔴 AN EMPTY SET FAILS. `node --test` given a pattern that matches nothing prints `# tests 0` and
 * exits 0 (measured 2026-09-25, Node 22.22) — a green run in which nothing ran. So the files are
 * found here, and zero files is exit 1: the same contract as `--min=1` for the harness tier.
 */
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const PATTERNS = ["**/*.test.ts", "**/*.test.mjs"];

/** Directories that are output, dependencies or scratch — never the test corpus. */
const skipped = (name: string): boolean =>
  name === "node_modules" ||
  name === "dist" ||
  name === ".git" ||
  name.startsWith(".tmp");

/** Every unit test under `root`, relative to it, sorted. */
export function unitTestFiles(root: string): string[] {
  return globSync(PATTERNS, {
    cwd: root,
    exclude: (p: string) => skipped(basename(p)),
  }).sort();
}

/** Run `files` with `node --test` from `root`; an empty list is a failure, not a pass. */
export function runUnitTests(root: string, files: readonly string[]): number {
  if (files.length === 0) {
    console.error(
      `✗ node --test: 0 files match ${PATTERNS.join(" ")} under ${root} — no unit test ran, and that is not a pass`,
    );
    return 1;
  }
  // 🔴 NODE_TEST_CONTEXT is how `node --test` tells a child it is one of its files: a nested
  // `node --test` that inherits it reports to the parent instead of exiting nonzero, so a red file
  // came back as exit 0 when this ran under `node --test` itself (measured 2026-09-25).
  const env = { ...process.env };
  delete env["NODE_TEST_CONTEXT"];
  const r = spawnSync(process.execPath, ["--test", ...files], {
    cwd: root,
    stdio: "inherit",
    env,
  });
  return r.status ?? 1;
}

/** One program on PATH (npm and `npm run check` put `node_modules/.bin` first). */
function tier(name: string, cmd: string, args: readonly string[]): number {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.error)
    console.error(`✗ ${name}: could not start ${cmd}: ${r.error.message}`);
  return r.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const codes = [
    tier("harness tier", "vigiles", [
      "test",
      "--min=1",
      ...process.argv.slice(2),
    ]),
    tier("type-check of the tests", "tsc", ["-p", "tsconfig.test.json"]),
    runUnitTests(ROOT, unitTestFiles(ROOT)),
  ];
  process.exit(codes.every((c) => c === 0) ? 0 : 1);
}
