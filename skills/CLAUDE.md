<!-- vigiles:sha256:e0aa2cec8926b04f compiled from skills/CLAUDE.md.spec.ts -->

# CLAUDE.md

## `skills/`

The skills this package ships. Loaded when working under `skills/`. The consumer's root and the
package's location come from `skills/paper-pipeline/scripts/consumer.mjs`; the links are made by
`src/link-skills.ts`; install-specific paths are flagged by `eslint-rules/install-path-literals.ts`.

## Rules

### Skills Ship In Skills

**Guidance only** — Skills ship in `skills/`, never `.claude/skills/`. `paperlint init` symlinks each one into the consumer's `.claude/skills/<name>`; the link's directory name is the skill's name. `skills/` is the npm layout: of 855 packages scanned, 336 shipped `skills/` against 15 `.claude/skills/`. Rejected: leaving the skills for Claude Code to find inside `node_modules` (`docs/install.md`); a symlink loads at startup, deterministically.

### A Criterion That Judges Prose

**Guidance only** — It follows the five principles in `eslint-rules/CLAUDE.md` ("A rule that judges prose"). A skill does not grep prose for what a rule can count.
