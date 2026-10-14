/**
 * The subcommands of `labels`, by name. One table, read twice: the dispatcher in `labels.ts`
 * compares against these, and `SKILL.md.spec.ts` interpolates them into every command it
 * instructs (a name that is not here is a type error there). So the skill cannot instruct a
 * subcommand the script does not have.
 *
 * A module of its own, with no side effects: the spec imports it at compile time, and importing
 * `labels.ts` itself would run the command line.
 */
export const COMMANDS = {
  validate: "validate",
  agree: "agree",
} as const;
