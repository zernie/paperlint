/**
 * The notice an upgrade owes a project whose hooks are only partly wired. `paperlint init` wires the
 * hooks once, so a release that ships one more (16.2.0 added `lint-edited`) leaves every project that
 * ran `init` before it without that hook, and nothing says so: `paperlint doctor` is run by hand,
 * and nobody does. The hooks that ARE wired run the NEW version's code after an upgrade, so one of
 * them says it.
 *
 * ── WHO SPEAKS ───────────────────────────────────────────────────────────────────
 * A PostToolUse hook that acts on a file inside a paper, once per installed version, as Claude Code's
 * `hookSpecificOutput.additionalContext` — the model sees it as a system reminder in the session. A
 * PreToolUse hook never speaks: its answer is a decision, and nothing here may change one. The
 * state is one small file under `node_modules/.cache/paperlint/`, beside the lint cache.
 *
 * ── WHO DECIDES WHAT IS MISSING ──────────────────────────────────────────────────
 * `unwiredHooks` (`src/hooks-settings.ts`), the function `paperlint doctor` reports with; this module
 * only words the answer and remembers that it was given.
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { isRecord } from "./domain/record.ts";
import type { Files } from "./ports/files.ts";

/** The hooks that may carry the notice: PostToolUse ones. A PreToolUse hook never does. */
export const NOTICE_HOOKS: readonly string[] = [
  "lint-edited",
  "paper-skills-nudge",
  "paper-status-gates",
];

/** Where the version last told is kept, relative to the project root. */
export const NOTICE_STATE = join(
  "node_modules",
  ".cache",
  "paperlint",
  "unwired-hooks.json",
);

/** The instruction the agent reads. `byHand`: `init` writes nothing then, so the remedy differs. */
export const noticeText = (
  version: string,
  missing: readonly string[],
  byHand: boolean,
): string =>
  `⚠ paperlint ${version} expects hooks that this project has not wired: ${missing.join(", ")}. ` +
  (byHand
    ? `Some paperlint hooks are wired by hand, so \`npx paperlint init\` writes nothing: add the missing ones in the same form, then run \`npx paperlint doctor\` to confirm.`
    : `Run \`npx paperlint init\` now, then \`npx paperlint doctor\` to confirm.`);

/** The one stderr line `paperlint lint` prints. */
export const lintLine = (version: string, missing: readonly string[]): string =>
  `paperlint ${version}: ${missing.length === 1 ? "hook" : "hooks"} ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not wired — run \`npx paperlint init\`, then \`npx paperlint doctor\``;

const statePath = (root: string) => callerPath(join(root, NOTICE_STATE));

/** True when this version has not told this project yet. An unreadable state counts as not told. */
export function notYetTold(
  files: Files,
  root: string,
  version: string,
): boolean {
  try {
    const bytes = files.readBytes(statePath(root));
    if (bytes === null) return true;
    const state: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return !(isRecord(state) && state["version"] === version);
  } catch {
    return true;
  }
}

/** Remembers that `version` told this project. */
export function recordTold(files: Files, root: string, version: string): void {
  files.writeAtomic(
    statePath(root),
    new TextEncoder().encode(`${JSON.stringify({ version })}\n`),
  );
}

/**
 * What the hook printed with the notice added to it: nothing printed → the notice alone; a JSON
 * object → the same object with the notice appended to `hookSpecificOutput.additionalContext`.
 * Null for anything else (the hook's own output is then passed through untouched, notice unsaid).
 */
export function mergeNotice(printed: string, notice: string): string | null {
  const ours = { hookEventName: "PostToolUse", additionalContext: notice };
  if (printed.trim() === "")
    return `${JSON.stringify({ hookSpecificOutput: ours })}\n`;
  try {
    const said: unknown = JSON.parse(printed);
    if (!isRecord(said)) return null;
    const mine = said["hookSpecificOutput"];
    const before = isRecord(mine) ? mine : {};
    const context = before["additionalContext"];
    return `${JSON.stringify({
      ...said,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        ...before,
        additionalContext:
          typeof context === "string" && context !== ""
            ? `${context}\n\n${notice}`
            : notice,
      },
    })}\n`;
  } catch {
    return null;
  }
}

/**
 * A sink for what an in-process or spawned hook prints, so the notice can be added to it before
 * Claude Code reads stdout once. The only mutation in this module, kept in one place.
 */
export function collector(): {
  readonly write: (text: string) => void;
  readonly text: () => string;
} {
  // eslint-disable-next-line functional/prefer-immutable-types -- the sink exists to accumulate
  const parts: string[] = [];
  return {
    // eslint-disable-next-line functional/immutable-data -- the sink exists to accumulate
    write: (text) => void parts.push(text),
    text: () => parts.join(""),
  };
}
