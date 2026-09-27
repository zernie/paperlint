/**
 * Shared support for vitest tests: a temp directory that removes itself, a file tree written in one
 * call, and a node script run as a process with its whole result captured.
 *
 * Every CLI test here repeated the same three blocks — `realpathSync(mkdtempSync(…))` plus an
 * `rmSync` in a `finally`, a loop of `mkdirSync`+`writeFileSync`, and a `spawnSync` whose status,
 * stdout and stderr were read piecemeal. One copy of each, so a test reads as its inputs and the
 * whole value it expects.
 *
 * A script run as a child inherits `process.env` by default, and with it NODE_V8_COVERAGE — which
 * is how `npm run coverage` measures CLIs. A test that passes its own `env` gets it merged OVER the
 * inherited one, so coverage survives unless a test deliberately removes it.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll } from "vitest";

/** A fresh temp directory (realpath, so macOS /var vs /private/var never differs), removed after the file's tests. */
export function useTempDir(prefix = "paperlint-test-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write `{ "relative/path": "contents" }` under `root`, creating directories. Returns `root`. */
export function writeTree(
  root: string,
  files: Readonly<Record<string, string>>,
): string {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return root;
}

/** `JSON.parse`, typed as what it is: a value nobody has checked yet. */
export const parseJson = (text: string): unknown => JSON.parse(text);

/**
 * Run `node [...nodeArgs] <script> ...args` and return `{ status, stdout, stderr }`. `env` is
 * merged over the inherited environment; `input` is written to stdin; `nodeArgs` are flags for
 * node itself (e.g. `--import <preload>` to stub a global before the script loads).
 */
export interface ScriptResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runNode(
  script: string,
  args: readonly string[] = [],
  {
    cwd,
    env = {},
    input,
    nodeArgs = [],
  }: {
    cwd?: string;
    env?: Readonly<Record<string, string>>;
    input?: string;
    nodeArgs?: readonly string[];
  } = {},
): ScriptResult {
  const r = spawnSync(process.execPath, [...nodeArgs, script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
