/**
 * The `paper-folder-layout` hook — `paper/allowed-files-only` and `repro/allowed-files-only` BEFORE a file is
 * created, not at the next lint. PreToolUse on `Edit|Write|MultiEdit` (`plugin/hooks/hooks.json`):
 * when the file about to be written does not exist yet and would add an entry the layout does not
 * allow — at a paper folder's root, or at the top of its `repro/` — the call is denied, and the
 * reason is the rule's own message: where the entry goes, and the layout drawn. The agent writes it
 * where it belongs instead, in the same turn.
 *
 * ── WHAT IT NEVER BLOCKS ─────────────────────────────────────────────────────────
 * - A file that already exists. Editing is never refused, wherever the file is: a paper whose
 *   folder predates the layout keeps working, and the rule reports what is out of place.
 * - A new file inside an entry that already exists, even one the layout does not allow: the entry is
 *   not new, and the rule reports it once, by name. Only a NEW entry is refused.
 * - Anything outside a paper folder (no `PIPELINE-STATUS.md` above it).
 * A new study folder in `repro/` is created with its `README.md` first: any other first file in it
 * is refused with `repro/allowed-files-only`'s "without a README.md" message.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────────
 * A shell command (`mv`, `cp`, a script writing files) is not an Edit or a Write, and this hook never
 * sees it. The guarantee is the lint: both rules fail `paperlint lint`, in CI, whatever wrote the
 * entry. The hook only saves the round trip. It does not read the paper's `rules` either: a paper
 * that switched a layout rule off is still refused a new stray entry.
 *
 * ── ONE FUNCTION PER RULE, NOT TWO LISTS ─────────────────────────────────────────
 * The texts are `strayTexts` (`src/folder-layout-rule.ts`) and `reproTexts`
 * (`src/repro-layout-rule.ts`), the functions the rules report with.
 *
 * ── WHY IT IS NOT A VIGILES PROGRAM LIKE ITS NEIGHBOURS (measured 2026-10-12, vigiles 38) ──────
 * A shipped `.hook.mjs` may import nothing but `vigiles/hook` (`checkHookImports`), so it cannot call
 * this package's function; its only way to a tool is `run()`, whose output reaches stderr and never
 * the hook's answer (`paper-status-gates.hook.mjs` measured that); and a `provide()` command runs
 * before the reaction without the event, so it cannot know which file is written. Each of the three
 * would mean a second copy of the layout. So `paperlint hook paper-folder-layout` runs this module
 * in-process (`runHook`, src/cli.ts), behind the same wiring command as the other hooks, which is
 * what `paperlint init` merges and `paperlint doctor` reads.
 *
 * ── THE CHEAP FIRST STEP ─────────────────────────────────────────────────────────
 * Before reading any settings or listing any folder, the hook looks for the nearest folder above the
 * file that holds `PIPELINE-STATUS.md` — the file every paper has and the rules are reported on — with
 * one `isFile` per ancestor and nothing else: no git, no lint. No such folder: no output.
 */
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { callerPath } from "./caller-path.ts";
import { ESCAPE_HATCH } from "./domain/paper-layout.ts";
import { README, REPRO_DIR, isStudyName } from "./domain/repro-layout.ts";
import { fieldOf } from "./domain/record.ts";
import { strayTexts, type FolderLayoutDeps } from "./folder-layout-rule.ts";
import type { Files } from "./ports/files.ts";
import { reproTexts } from "./repro-layout-rule.ts";

/** The file every paper folder has, and the rules are reported on. */
const STATUS_FILE = "PIPELINE-STATUS.md";

/** What Claude Code reads from a PreToolUse hook's stdout to refuse the call, with the reason. */
export interface HookOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: "PreToolUse";
    readonly permissionDecision: "deny";
    readonly permissionDecisionReason: string;
  };
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
export function paperFolderOf(file: string, files: Files): string | null {
  // The same reach as lint's `**/extra/` ignore: a folder named extra/ anywhere above the file.
  if (dirname(file).split(sep).includes(ESCAPE_HATCH)) return null;
  const up = (dir: string): string | null => {
    if (files.isFile(callerPath(join(dir, STATUS_FILE)))) return dir;
    const parent = dirname(dir);
    return parent === dir ? null : up(parent);
  };
  return up(dirname(file));
}

/** The entry `segments` would add under `dir`, as the layout judges it; null when it exists. */
const newEntry = (
  dir: string,
  [name = "", ...below]: readonly string[],
  deps: FolderLayoutDeps,
): { readonly name: string; readonly kind: "file" | "dir" } | null =>
  deps.listDir(callerPath(dir)).includes(name)
    ? null
    : { name, kind: below.length > 0 ? "dir" : "file" };

/** Why creating `segments` (relative to the paper folder `dir`) breaks the layout; null when not. */
function refusal(
  dir: string,
  segments: readonly string[],
  deps: FolderLayoutDeps,
): string | null {
  const atRoot = newEntry(dir, segments, deps);
  const [rootText] =
    atRoot === null ? [] : strayTexts(dir, [atRoot], deps.files);
  if (rootText !== undefined) return rootText;
  const [top, ...inRepro] = segments;
  if (top !== REPRO_DIR || inRepro.length === 0) return null;
  const entry = newEntry(join(dir, REPRO_DIR), inRepro, deps);
  // A new study folder starts with its README.md: that write is what makes it complete.
  if (
    entry === null ||
    (isStudyName(entry.name) && inRepro.slice(1).join("/") === README)
  )
    return null;
  const [text] = reproTexts(dir, [entry], deps.files);
  return text ?? null;
}

/** The hook: the payload of an Edit or a Write in, Claude Code's refusal out, or null to allow. */
export function folderLayoutHook(
  payload: unknown,
  deps: FolderLayoutDeps,
): HookOutput | null {
  const file = writtenPath(payload);
  const dir = file === null ? null : paperFolderOf(file, deps.files);
  if (file === null || dir === null || deps.files.isFile(callerPath(file)))
    return null;
  const reason = refusal(dir, relative(dir, file).split(/[\\/]/), deps);
  return reason === null
    ? null
    : {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      };
}
