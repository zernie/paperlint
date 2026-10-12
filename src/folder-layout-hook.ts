/**
 * The `paper-folder-layout` hook — `paper/folder-layout` at the moment a file is written, not at the
 * next lint. PostToolUse on `Edit|Write|MultiEdit` (`plugin/hooks/hooks.json`): when the file just
 * written stands at a paper folder's root, or inside a root folder the layout does not allow, the
 * agent gets the rule's own message as `additionalContext` and can move the file in the same turn.
 *
 * ── ONE FUNCTION, NOT TWO LISTS ──────────────────────────────────────────────────
 * The text is `strayTexts` (`src/folder-layout-rule.ts`), the function the rule reports with: the
 * allowed set, the cure table and the wording exist once.
 *
 * ── WHY IT IS NOT A VIGILES PROGRAM LIKE ITS NEIGHBOURS (measured 2026-10-12, vigiles 38) ──────
 * A shipped `.hook.mjs` may import nothing but `vigiles/hook` (`checkHookImports`), so it cannot call
 * this package's function; its only way to a tool is `run()`, whose output reaches stderr and never
 * `additionalContext` (`paper-status-gates.hook.mjs` measured that); and a `provide()` command runs
 * before the reaction without the event, so it cannot know which file was written. Each of the three
 * would mean a second copy of the layout. So `paperlint hook paper-folder-layout` runs this module
 * in-process (`runHook`, src/cli.ts), behind the same wiring command as the other hooks, which is
 * what `paperlint init` merges and `paperlint doctor` reads.
 *
 * ── THE CHEAP FIRST STEP ─────────────────────────────────────────────────────────
 * Before reading any settings or listing any folder, the hook looks for the nearest folder above the
 * file that holds `PIPELINE-STATUS.md` — the file every paper has and the rule is reported on — with
 * one `isFile` per ancestor and nothing else: no git, no lint. No such folder: no output. What the
 * hook process costs is the CLI's import, the same as every `paperlint hook` (docs: the rule's page).
 *
 * It cannot tell a file just created from one edited again, so a stray file is named on every write
 * until it is moved. That is the point: it is still in the wrong place.
 */
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import { fieldOf } from "./domain/record.ts";
import { strayTexts } from "./folder-layout-rule.ts";
import type { Files } from "./ports/files.ts";

/** The file every paper folder has, and the rule is reported on. */
const STATUS_FILE = "PIPELINE-STATUS.md";

/** What Claude Code reads from a PostToolUse hook's stdout to add to the agent's context. */
export interface HookOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: "PostToolUse";
    readonly additionalContext: string;
  };
}

/** The written file's absolute path from the payload; null when there is none to read. */
export function writtenPath(payload: unknown): string | null {
  const input = fieldOf(payload, "tool_input");
  const raw = fieldOf(input, "file_path") ?? fieldOf(input, "notebook_path");
  if (typeof raw !== "string" || raw === "") return null;
  if (isAbsolute(raw)) return resolve(raw);
  const cwd = fieldOf(payload, "cwd");
  return typeof cwd === "string" && isAbsolute(cwd) ? resolve(cwd, raw) : null;
}

/** The nearest folder above `file` holding `PIPELINE-STATUS.md`, up to the root; null when none. */
export function paperFolderOf(file: string, files: Files): string | null {
  const up = (dir: string): string | null => {
    if (files.isFile(callerPath(join(dir, STATUS_FILE)))) return dir;
    const parent = dirname(dir);
    return parent === dir ? null : up(parent);
  };
  return up(dirname(file));
}

/** The hook: the payload of a write in, Claude Code's output out, or null to say nothing. */
export function folderLayoutHook(
  payload: unknown,
  files: Files,
): HookOutput | null {
  const file = writtenPath(payload);
  const dir = file === null ? null : paperFolderOf(file, files);
  if (file === null || dir === null) return null;
  const [name = "", ...below] = relative(dir, file).split(/[\\/]/);
  const [text] = strayTexts(
    dir,
    [{ name, kind: below.length > 0 ? "dir" : "file" }],
    files,
  );
  return text === undefined
    ? null
    : {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: text,
        },
      };
}
