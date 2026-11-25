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
import assert from "node:assert/strict";
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
import type { Answer, Prompts } from "../src/ports/prompts.ts";

/** A fresh temp directory (realpath, so macOS /var vs /private/var never differs), removed after the file's tests. */
export function useTempDir(prefix = "paperlint-test-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** Write `{ "relative/path": "contents" }` under `root`, creating directories. Returns `root`. */
export function writeTree(
  root: string,
  files: Readonly<Record<string, string | Uint8Array>>,
): string {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return root;
}

/**
 * A venue preset of a test's own, as an object: the identity every venue declares, then `body`. Its
 * `name` is `label` — the file name a preset without one was labelled by — so the messages a test
 * expects keep naming it as before.
 */
export const venuePreset = (
  label: string,
  body: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> => ({
  type: "venue",
  name: label,
  url: "https://example.org/cfp",
  ...body,
});

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

/**
 * The value, or a failed test that names what was missing — a `!` that checks instead of
 * assuming. For values a test's own setup guarantees but the type cannot (an array index, a
 * `Map` lookup, the one result of a one-file lint).
 */
export function present<T>(value: T | null | undefined, what: string): T {
  assert.ok(value !== undefined && value !== null, `expected ${what}`);
  return value;
}

/** What a scripted question answers: a value, nothing (Enter: the initial value), the string `"cancel"`, a failure. */
export type Reply = string | boolean | undefined | Error;

/**
 * The `Prompts` port answered by `script(message)`, recording every message in `asked`. A reply of the
 * wrong kind for its question (a string to a confirm) fails the test rather than being coerced.
 */
export function scriptedPrompts(
  script: (message: string) => Reply,
): Prompts & { readonly asked: string[] } {
  const asked: string[] = [];
  const reply = async <T>(
    message: string,
    initial: T,
    is: (v: unknown) => v is T,
  ): Promise<Answer<T>> => {
    asked.push(message);
    const r = await Promise.resolve(script(message));
    if (r instanceof Error) throw r;
    if (r === "cancel") return { kind: "cancel" };
    if (r === undefined) return { kind: "answer", value: initial };
    assert.ok(is(r), `the reply to "${message}" is of the wrong kind`);
    return { kind: "answer", value: r };
  };
  const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
  const isString = (v: unknown): v is string => typeof v === "string";
  return {
    asked,
    confirm: ({ message, initial }) => reply(message, initial, isBoolean),
    select: ({ message, initial }) => reply(message, initial, isString),
    text: ({ message }) => reply(message, "", isString),
  };
}

/**
 * A one-page PDF whose only text is `lines`, one per line, in Helvetica (not embedded): the
 * smallest PDF pdf.js reads as text, written here so a test needs no PDF library. The cross-reference
 * offsets are counted from the bytes, so a reader that checks them finds them right.
 */
export function onePagePdf(lines: readonly string[]): string {
  const escaped = lines.map((l) => `(${l.replace(/[\\()]/g, "\\$&")}) Tj T*`);
  const stream = `BT /F1 11 Tf 13 TL 72 720 Td ${escaped.join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`,
  ];
  const head = "%PDF-1.4\n";
  const bodies = objects.map(
    (o, i) => `${String(i + 1)} 0 obj\n${o}\nendobj\n`,
  );
  const offsets = bodies.map(
    (_, i) => head.length + bodies.slice(0, i).join("").length,
  );
  const xref = [
    `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`,
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`),
  ].join("");
  const start = head.length + bodies.join("").length;
  return `${head}${bodies.join("")}${xref}trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(start)}\n%%EOF\n`;
}
