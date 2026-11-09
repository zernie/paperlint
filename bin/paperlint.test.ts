/**
 * `bin/paperlint.mjs` — the shim's one decision of its own: with no `dist/` beside it (a clone
 * before `npm run build`, a git dependency installed with `--ignore-scripts`) it refuses loudly,
 * naming the missing file and both remedies, instead of an ERR_MODULE_NOT_FOUND from the loader.
 *
 * The missing build is staged with a preload that makes `existsSync` answer "no" for exactly
 * `dist/cli.js` — the shim reads the real file, so the real shim is what is measured.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const BIN = fileURLToPath(new URL("./paperlint.mjs", import.meta.url));
const DIST = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

const HIDE_DIST = [
  'import fs from "node:fs";',
  'import { syncBuiltinESMExports } from "node:module";',
  "const real = fs.existsSync;",
  'fs.existsSync = (p) => (String(p).endsWith("/dist/cli.js") ? false : real(p));',
  "syncBuiltinESMExports();",
].join("\n");

test("no dist/: exit 2, the missing path, and both remedies — nothing from the loader", () => {
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      `data:text/javascript,${encodeURIComponent(HIDE_DIST)}`,
      BIN,
      "--version",
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  const [first, ...rest] = r.stderr.split("\n");
  assert.equal(first, `paperlint: not built — ${DIST} missing.`);
  assert.match(
    rest.join("\n"),
    /In a clone: `npm run build`\. For a git dependency: reinstall without `--ignore-scripts`\./,
  );
  assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND/);
});

test("the documented import `paperlint/bin/paperlint.mjs` is the CLI's module: buildConfig and rulesOff, through package.json's exports", () => {
  // Guards: this file exports nothing since the fast path (a static export loads the whole CLI);
  // the specifier docs/configuration.md documents must still reach the CLI's exports.
  const r = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'const m = await import("paperlint/bin/paperlint.mjs"); console.log(typeof m.buildConfig, typeof m.rulesOff, typeof m.run);',
    ],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
  );
  assert.equal(r.stderr, "");
  assert.equal(r.stdout, "function function function\n");
});

test("`hook submission-confirm` through the shim reads its payload from the real stdin — the one in-process hook the fast path does not feed", () => {
  // Guards: the fast path hands stdin only to the file hooks; this one reaches `runHook` from the
  // `hook` command, whose own default reader is the process's stdin. A refusal here proves it read it.
  const r = spawnSync(process.execPath, [BIN, "hook", "submission-confirm"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    input: JSON.stringify({
      tool_input: { command: "npx paperlint submission update nope --save" },
      cwd: fileURLToPath(new URL("..", import.meta.url)),
    }),
  });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
  assert.match(
    r.stdout,
    /^\{"hookSpecificOutput":\{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Not run: this sends the paper to the venue's portal/,
  );
});
