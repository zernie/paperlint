/**
 * A throwaway consumer project for running a shipped hook exactly as a consumer's settings run it
 * (`vigiles hook-runtime run-program`): `package.json`, `node_modules/vigiles` and
 * `node_modules/paperlint` as symlinks into this checkout (what `npm install` of a local package
 * makes), plus whatever `files` the case needs.
 */
import { mkdirSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runHook } from "vigiles";
import { writeTree } from "./support.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "node_modules", "vigiles", "dist", "cli.js");

/** Lay out a consumer project in `dir` holding `files`; returns `dir`. */
export function hookConsumer(dir, files = {}) {
  writeTree(dir, {
    "package.json": '{"name":"c","type":"module"}\n',
    ...files,
  });
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  symlinkSync(
    join(ROOT, "node_modules", "vigiles"),
    join(dir, "node_modules", "vigiles"),
  );
  symlinkSync(ROOT, join(dir, "node_modules", "paperlint"));
  return dir;
}

/** Run hooks/<name>.hook.mjs on `input` from `dir`, with `CLAUDE_PROJECT_DIR` set to it. */
export function runShippedHook(name, input, dir) {
  const program = `node ${JSON.stringify(CLI)} hook-runtime run-program ${JSON.stringify(join(ROOT, "hooks", `${name}.hook.mjs`))}`;
  return runHook(program, input, {
    cwd: dir,
    env: { CLAUDE_PROJECT_DIR: dir },
  });
}

/** A PostToolUse Edit of `file_path`. */
export const onEdit = (file_path) => ({
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  tool_input: { file_path },
  tool_response: {},
});

/** A PreToolUse Bash command. */
export const onBash = (command) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command },
});
