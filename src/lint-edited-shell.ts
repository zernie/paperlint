/**
 * Which paper files a Bash command wrote, as far as its words say: the half of the `lint-edited`
 * hook (`src/lint-edited-hook.ts`) that reads a shell command instead of an Edit's `file_path`.
 *
 * The wiring starts the hook only for a command that names a `.tex` (`"if": "Bash(*.tex*)"` in
 * `plugin/hooks/hooks.json`, written by hand until zernie/vigiles#496 lets a compiled hook declare
 * it). The command is read by vigiles' shell parser, handed in as `leaves` (vigiles is a tool
 * package: only `src/cli.ts` imports it), never by a pattern over its text: every `.tex` that is a word
 * of a simple command, or the target of a redirection that writes, resolved against the payload's
 * `cwd`. A file that does not exist, or is in no paper, is dropped. A command says no line it wrote.
 */
import { isAbsolute, resolve } from "node:path";
import { groupBy, unique } from "remeda";
import { callerPath } from "./caller-path.ts";
import { paperFolderOf } from "./domain/paper-folder.ts";
import { fieldOf } from "./domain/record.ts";
import type { Files } from "./ports/files.ts";

/** One simple command as the shell reads it: what this module reads of vigiles' `NormalizedLeaf`. */
export interface ShellLeaf {
  readonly args: readonly string[];
  readonly redirects: readonly {
    readonly target: string | null;
    readonly writes: boolean;
  }[];
}

/** The extension of the files a command is read for; the wiring's `if` names the same. */
const TEX = ".tex";

/** Every word of `leaves` and every target they write by redirection. */
const wordsOf = (leaves: readonly ShellLeaf[]): readonly string[] =>
  leaves.flatMap((l) => [
    ...l.args,
    ...l.redirects.flatMap((r) =>
      r.writes && r.target !== null ? [r.target] : [],
    ),
  ]);

/** The `.tex` files the command in `payload` names, absolute; none without a command or an absolute cwd. */
function namedTex(
  payload: unknown,
  leaves: (command: string) => readonly ShellLeaf[],
): readonly string[] {
  const command = fieldOf(fieldOf(payload, "tool_input"), "command");
  const cwd = fieldOf(payload, "cwd");
  if (typeof command !== "string" || typeof cwd !== "string") return [];
  if (!isAbsolute(cwd)) return [];
  return unique(
    wordsOf(leaves(command))
      .filter((w) => w.endsWith(TEX))
      .map((w) => resolve(cwd, w)),
  );
}

/** The papers a Bash command wrote in, each with the existing `.tex` files it names there. */
export function shellPapers(
  payload: unknown,
  files: Files,
  leaves: (command: string) => readonly ShellLeaf[],
): readonly { readonly dir: string; readonly files: readonly string[] }[] {
  const placed = namedTex(payload, leaves).flatMap((file) => {
    const dir = files.isFile(callerPath(file))
      ? paperFolderOf(file, files)
      : null;
    return dir === null ? [] : [{ dir, file }];
  });
  return Object.entries(groupBy(placed, (p) => p.dir)).map(([dir, ps]) => ({
    dir,
    files: ps.map((p) => p.file),
  }));
}
