/**
 * Which paper folder an edited file belongs to — the first question of both hooks that look at a
 * file an agent writes (`paper-folder-layout`, `lint-edited`), and the ONLY question asked before the
 * CLI loads.
 *
 * ── WHY IT IS ITS OWN MODULE (measured 2026-11-09, built `dist/`) ──────────────────
 * Claude Code runs both hooks on every Edit and Write, in every repository that installed paperlint,
 * and nearly every edit is of a file outside any paper. Answering that through `dist/cli.js` cost
 * ~700 ms per edit: importing the CLI alone is ~670 ms (ESLint, every rule, every adapter). This
 * module imports `node:path` and three small domain files, and `bin/paperlint.mjs` asks it first: a
 * file outside every paper is answered in the time Node takes to start. `fileHookGate` is the whole
 * decision; the bin only hands it the two effects it needs, reading stdin and asking whether a path
 * is a file.
 *
 * ── THE ONE OWNER ────────────────────────────────────────────────────────────────
 * `writtenPath` and `paperFolderOf` are the functions the hooks themselves call
 * (`src/folder-layout-hook.ts`, `src/lint-edited-hook.ts`), so the gate and the hooks cannot disagree
 * about which file is in which paper.
 */
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { ESCAPE_HATCH } from "./paper-layout.ts";
import { absolutePath, type AbsolutePath } from "./paths.ts";
import { fieldOf } from "./record.ts";

/** The file every paper folder has, and the rules are reported on. */
export const STATUS_FILE = "PIPELINE-STATUS.md";

/** The hooks that look at the file an Edit or a Write names: the ones `fileHookGate` answers for. */
export const FILE_HOOKS: readonly string[] = [
  "paper-folder-layout",
  "lint-edited",
];

/** The one question the gate asks of the disk. */
export interface IsFile {
  isFile(p: AbsolutePath): boolean;
}

/** The target file's absolute path from the payload; null when there is none to read. */
export function writtenPath(payload: unknown): string | null {
  const input = fieldOf(payload, "tool_input");
  const raw = fieldOf(input, "file_path") ?? fieldOf(input, "notebook_path");
  if (typeof raw !== "string" || raw === "") return null;
  if (isAbsolute(raw)) return resolve(raw);
  const cwd = fieldOf(payload, "cwd");
  return typeof cwd === "string" && isAbsolute(cwd) ? resolve(cwd, raw) : null;
}

/**
 * The nearest folder above `file` holding `PIPELINE-STATUS.md`, up to the root; null when none, and
 * null for anything under a folder named `extra/`, which lint never reads: an archived paper kept
 * there carries its own status file and is not a paper to hold to the layout.
 */
export function paperFolderOf(file: string, files: IsFile): string | null {
  // The same reach as lint's `**/extra/` ignore: a folder named extra/ anywhere above the file.
  if (dirname(file).split(sep).includes(ESCAPE_HATCH)) return null;
  const up = (dir: string): string | null => {
    if (files.isFile(absolutePath(join(dir, STATUS_FILE)))) return dir;
    const parent = dirname(dir);
    return parent === dir ? null : up(parent);
  };
  return up(dirname(file));
}

/**
 * What the bin does with its arguments, decided before the CLI loads:
 *   other   not a file hook — the CLI runs as always, and stdin is left unread for it
 *   quiet   a file hook whose payload names no file in a paper folder — exit 0, no output
 *   hook    a file hook about a paper's file, or a payload it cannot read — the hook runs, handed the
 *           stdin read here (a stream is read once), and says itself what went wrong
 */
export type FileHookGate =
  | { readonly kind: "other" }
  | { readonly kind: "quiet" }
  | {
      readonly kind: "hook";
      readonly name: string;
      readonly stdin: () => string;
    };

/** The text `read` returns, or the error it threw, rethrown when the hook asks for its stdin. */
const readOnce = (read: () => string): (() => string) => {
  try {
    const text = read();
    return () => text;
  } catch (e) {
    return () => {
      throw e;
    };
  }
};

/** The JSON in `text`, or undefined when it is not JSON. */
const parsed = (text: string): unknown => {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
};

/** Is the edit `stdin` describes one the hook must look at? An unreadable one is: the hook says why. */
const concernsAPaper = (stdin: () => string, files: IsFile): boolean => {
  try {
    const payload = parsed(stdin());
    if (payload === undefined) return true;
    const file = writtenPath(payload);
    return file !== null && paperFolderOf(file, files) !== null;
  } catch {
    return true;
  }
};

export function fileHookGate(
  argv: readonly string[],
  read: () => string,
  files: IsFile,
): FileHookGate {
  const [command, name] = argv;
  if (command !== "hook" || name === undefined || !FILE_HOOKS.includes(name))
    return { kind: "other" };
  const stdin = readOnce(read);
  return concernsAPaper(stdin, files)
    ? { kind: "hook", name, stdin }
    : { kind: "quiet" };
}
