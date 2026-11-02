/**
 * The generator's command line as a process (label-page.ts): a wrong call exits 2, a refusal 1, an
 * error that is no refusal 1 with its message and no stack. Everything else is tested as functions.
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { spawnSync } from "node:child_process";
import { build, config, setup } from "../../../test/label-page-kit.ts";

const ENTRY = join(import.meta.dirname, "label-page.ts");

/** The command line as a process: what the argv layer and the exit code do outside the functions. */
function runProcess(args: readonly string[]): {
  status: number | null;
  out: string;
} {
  const r = spawnSync(process.execPath, [ENTRY, ...args], { encoding: "utf8" });
  assert.equal(r.error, undefined, String(r.error));
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("🔴 the command line: a wrong call is a usage error (2), a malformed date a refusal (1), today by default", () => {
  for (const args of [
    [],
    ["build", "x"],
    ["build", "a", "b", "--date", "2026-01-01"],
    ["schema", "x"],
    ["--nope"],
  ]) {
    const r = runProcess(args);
    assert.equal(r.status, 2, `${args.join(" ")}\n${r.out}`);
    assert.match(r.out, /^usage: label-page\.js build/);
  }
  const dir = setup("dates", config());
  build(dir);
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({ answers: {}, groups: {} }),
  );
  const bad = runProcess([
    "export",
    join(dir, "dump.json"),
    join(dir, "out", "key.json"),
    join(dir, "data"),
    "--date",
    "1 Jan",
  ]);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /REFUSED: --date must be YYYY-MM-DD/);
  const today = runProcess([
    "export",
    join(dir, "dump.json"),
    join(dir, "out", "key.json"),
    join(dir, "data"),
  ]);
  assert.match(
    today.out,
    /-labels-\d{4}-\d{2}-\d{2}\.json: 0 of 12 items complete/,
  );
}, 60_000);

test("🔴 an error that is no refusal (an output path that is a file) exits 1 with its message, not a stack", () => {
  const dir = setup("out-is-file", config());
  writeFileSync(join(dir, "out"), "a file");
  const r = runProcess(["build", join(dir, "items.json"), join(dir, "out")]);
  assert.equal(r.status, 1);
  assert.match(r.out, /EEXIST|ENOTDIR/);
  assert.doesNotMatch(r.out, /\n\s+at /);
});
