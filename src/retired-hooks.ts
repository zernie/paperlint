/**
 * Hooks an earlier paperlint shipped and this one does not. `paperlint init` writes the hook entries
 * into `.claude/settings.json` once, and an upgrade does not run it again, so a project keeps calling
 * a removed hook on every tool call. Running `init` again rewrites every entry it wrote, which drops
 * them (measured on 2026-11-23); until then `paperlint hook <name>` runs nothing for these names and
 * exits 0, and `paperlint doctor` and the once-per-version notice name them.
 *
 * A name is added here in the release that removes the hook, and is never taken out.
 */
import {
  SETTINGS_PATH,
  commandsIn,
  hookRun,
  readSettings,
} from "./hooks-settings.ts";

export const RETIRED_HOOKS: readonly string[] = [
  "paper-status-gates",
  "paper-edit-guard",
  "paper-skills-nudge",
];

/** The retired hooks the project's settings still run, in any spelling, each once; none when the file does not parse. */
export function retiredWired(root: string): readonly string[] {
  const read = readSettings(root);
  if (read.status === "unparsable") return [];
  const names = commandsIn(read.settings).flatMap(({ command }) => {
    const run = hookRun(command);
    return run !== null && RETIRED_HOOKS.includes(run.name) ? [run.name] : [];
  });
  return [...new Set(names)];
}

/** What `paperlint doctor` prints under its hooks section for them; nothing when none is wired. */
export const retiredLines = (retired: readonly string[]): readonly string[] =>
  retired.length === 0
    ? []
    : [
        `  ⚠ retired — still wired, but this paperlint no longer ships: ${retired.join(", ")}`,
        `      they run nothing now; \`npx paperlint init\` removes the entries it wrote, delete any others from ${SETTINGS_PATH}`,
      ];
