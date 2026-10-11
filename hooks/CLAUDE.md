# CLAUDE.md — `hooks/`

The hooks this package ships into a consumer's Claude Code session. Loaded when working under
`hooks/`. Full text and measurements: [`docs/repo-rules.md`](../docs/repo-rules.md#rule-6),
[`docs/delivery.md`](../docs/delivery.md).

A bug here does not break this repository; it breaks somebody else's whole session. The Bash gate
fails closed, so a hook that cannot read its config denies every command, including the one that
would undo it.

- **6. Never depend on the consumer's cwd.** Resolve paths from `git rev-parse --show-toplevel` or
  from the module's own location. Measured 2026-09-16: a hook read its config with
  `cat package.json`, the session changed directory for an unrelated reason, and the gate denied
  every command in it.
- **Ship `.hook.mjs`, never `.hook.ts`, and keep no `.hook.ts` twin.** A `.ts` hook inside
  `node_modules` fails to load and blocks every Bash command.
- **A shipped hook cannot import a sibling module.** The papers-root resolver is repeated in each
  hook, and `hooks.harness.ts` compares the copies.
- **`checkHookImports` (run by `hooks.harness.ts`) is a text regex.** Describe a forbidden import in
  words; never write one, not even in a comment.
- **The wiring is `plugin/hooks/hooks.json`.** `paperlint init` merges it into the consumer's
  `.claude/settings.json`; there is no second copy.
- **`vigiles` moves with the consumer's pin, in one pass.** A major mismatch makes `PreToolUse`
  refuse every command.
