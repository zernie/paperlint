#!/usr/bin/env node
/**
 * docs-only.ts — does a pull request change documentation and nothing else?
 *
 * CI's `build-e2e` installs TeX Live and builds papers on Linux and macOS, minutes per run. A pull
 * request that only edits prose cannot change what that job tests, so the `changes` job in
 * `.github/workflows/ci.yml` asks this script and `build-e2e` skips when the answer is yes.
 * `gates` always runs: tests read the docs (`test/readme-shape.test.ts`, `vigiles lint README.md`,
 * `fmt:check`).
 *
 * Documentation is a Markdown file at the repository root or anywhere under `docs/`. Everything
 * else is code for this purpose: a skill's SKILL.md ships in the package, and presets, fixtures
 * and `.github/` decide what the build does.
 *
 * An empty list is NOT docs-only. No changed files means the list was not read, and a skip on a
 * list nobody read is the green-zero this repository exists to refuse.
 *
 * Run: changed paths on stdin, one per line; prints `docs_only=true` or `docs_only=false`, the
 * line `$GITHUB_OUTPUT` takes.
 */
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** True when the path is a Markdown file at the root or under `docs/`. */
export const isDoc = (path: string): boolean =>
  path.endsWith(".md") && (!path.includes("/") || path.startsWith("docs/"));

/** True when there is at least one path and every one of them is documentation. */
export const docsOnly = (paths: readonly string[]): boolean =>
  paths.length > 0 && paths.every(isDoc);

/** The output line for the newline-separated list `text`. */
export const main = (text: string): string =>
  `docs_only=${String(
    docsOnly(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    ),
  )}`;

// Node built-ins only, and not `isMain` from consumer.mjs: that module imports `#lib/*`, which
// needs `npm ci`, and the CI job that runs this file installs nothing. Guarded by realpath, as in
// eslint-report-guard.mjs: through a symlink `argv[1]` is the link and the plain comparison is false.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(main(readFileSync(0, "utf8")));
