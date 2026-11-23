/**
 * The notice an upgrade owes a project whose hooks are only partly wired or whose shipped skills
 * are not all linked into `.claude/skills/` (16.8.0 shipped `rewrite-unclear`; a project that ran
 * `init` before it never got the link, and only a hand-run `doctor` said so). `paperlint init` wires the
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
 * only words the answer and remembers that it was given. The skills come from `unlinkedSkills`
 * (`src/link-skills.ts`), the report `paperlint doctor` and `init` read: a skill is named only when
 * its status is `missing`; a name taken by the project's own entry (`foreign`) is its choice, and
 * `doctor` reports it.
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { isRecord } from "./domain/record.ts";
import { SKILLS_HOME } from "./link-skills.ts";
import type { Files } from "./ports/files.ts";

/** The hooks that may carry the notice: PostToolUse ones. A PreToolUse hook never does. */
export const NOTICE_HOOKS: readonly string[] = [
  "lint-edited",
  "paper-skills-nudge",
];

/** What `paperlint hook [name]` says when it cannot run a hook: no name, or no such hook shipped. It names the remedy; the caller does not deny (#324). */
export const hookNotRunningText = (
  name: string | undefined,
  program: string,
  version: string,
): string =>
  name === undefined || name === ""
    ? "paperlint: `hook` needs a name, e.g. `paperlint hook paper-edit-guard`; no hook is running."
    : `paperlint: unknown hook \`${name}\` — no such program at ${program}; it is NOT running (installed: paperlint ${version}). Run \`npm install\`, or remove \`paperlint hook ${name}\` from .claude/settings.json.`;

/** Where the version last told is kept, relative to the project root. */
export const NOTICE_STATE = join(
  "node_modules",
  ".cache",
  "paperlint",
  "unwired-hooks.json",
);

const SKILLS_HOME_SHOWN = `${SKILLS_HOME}/`;

/** The instruction the agent reads. `byHand`: `init` writes no hooks then, so the remedy differs. */
export const noticeText = (
  version: string,
  missing: readonly string[],
  byHand: boolean,
  skills: readonly string[] = [],
): string => {
  const what = [
    ...(missing.length === 0
      ? []
      : [
          `expects hooks that this project has not wired: ${missing.join(", ")}`,
        ]),
    ...(skills.length === 0
      ? []
      : [
          `ships skills that are not linked into ${SKILLS_HOME_SHOWN}: ${skills.join(", ")}`,
        ]),
  ].join(", and ");
  const handHooks = byHand && missing.length > 0;
  return (
    `⚠ paperlint ${version} ${what}. ` +
    (handHooks
      ? `Some paperlint hooks are wired by hand, so \`npx paperlint init\` writes no hooks: add the missing ones in the same form${skills.length === 0 ? "" : " (init does link the skills)"}, then run \`npx paperlint doctor\` to confirm.`
      : `Run \`npx paperlint init\` now, then \`npx paperlint doctor\` to confirm.`)
  );
};

/** The one stderr line `paperlint lint` prints. */
export const lintLine = (
  version: string,
  missing: readonly string[],
  skills: readonly string[] = [],
): string =>
  `paperlint ${version}: ${[
    ...(missing.length === 0
      ? []
      : [
          `${missing.length === 1 ? "hook" : "hooks"} ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not wired`,
        ]),
    ...(skills.length === 0
      ? []
      : [
          `${skills.length === 1 ? "skill" : "skills"} ${skills.join(", ")} ${skills.length === 1 ? "is" : "are"} not linked`,
        ]),
  ].join("; ")} — run \`npx paperlint init\`, then \`npx paperlint doctor\``;

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
