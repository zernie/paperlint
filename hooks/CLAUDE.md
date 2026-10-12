# CLAUDE.md — `hooks/`

The hooks this package ships into a consumer's Claude Code session. Loaded when working under
`hooks/`. Every shipped hook is run in both halves, firing and silent, by `hooks.harness.ts`.

A bug here does not break this repository; it breaks somebody else's whole session. The Bash gate
fails closed, so a hook that cannot read its config denies every command, including the one that
would undo it.

- **Never depend on the consumer's cwd.** Resolve paths from `git rev-parse --show-toplevel` or
  from the module's own location; a session that changes directory must not change what a hook
  reads.
- **Ship `.hook.mjs`, never `.hook.ts`.** A `.ts` hook inside `node_modules` fails to load and
  blocks every Bash command. Rejected, so not proposed again: a `.hook.ts` twin compiled to the
  `.mjs` (a twin drifts from its build, and nothing would notice), and a thin `.hook.ts` in the
  consumer importing the logic from here (`vigiles compile` refuses the import, so the hook can
  never be re-stamped, and the runtime fails closed on the stale stamp).
  [Measurements](https://github.com/zernie/paperlint/blob/b4a3dc3a81d436186f41db2d69b65fd93f1af3b6/CLAUDE.md#L272-L357).
- **A shipped hook cannot import a sibling module.** The papers-root resolver is repeated in each
  hook, and `hooks.harness.ts` compares the copies.
- **`checkHookImports` (run by `hooks.harness.ts`) is a text regex.** Describe a forbidden import in
  words; never write one, not even in a comment.
- **The wiring is `plugin/hooks/hooks.json`.** `paperlint init` merges it into the consumer's
  `.claude/settings.json`; there is no second copy.
- **`vigiles` moves with the consumer's pin, in one pass.** A major mismatch makes `PreToolUse`
  refuse every command. `npm ls vigiles` compares what is installed with the manifest, not with the
  registry; Dependabot (`.github/dependabot.yml`) carries the registry half.
