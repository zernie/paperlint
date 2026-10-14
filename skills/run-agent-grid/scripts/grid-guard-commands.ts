/**
 * The subcommands of `grid-guard`, by name. One table, read twice: the dispatcher in
 * `grid-guard.ts` is keyed by these names (a missing or extra entry is a type error there), and
 * `SKILL.md.spec.ts` interpolates them into every command it instructs (a name that is not here
 * is a type error there). So the skill cannot instruct a subcommand the script does not have.
 *
 * A module of its own, with no side effects: the spec imports it at compile time, and importing
 * `grid-guard.ts` itself would run the command line.
 */
export const COMMANDS = {
  lock: "lock",
  release: "release",
  gate: "gate",
  overlap: "overlap",
  envProbe: "env-probe",
  scanKeys: "scan-keys",
  precommit: "precommit",
} as const;

/** A subcommand's name as typed on the command line. */
export type CommandName = (typeof COMMANDS)[keyof typeof COMMANDS];
