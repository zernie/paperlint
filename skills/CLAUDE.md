<!-- vigiles:sha256:5a8bf895a34de689 compiled from skills/CLAUDE.md.spec.ts -->

# CLAUDE.md

## `skills/`

The skills this package ships. Loaded when working under `skills/`. The consumer's root and the
package's location come from `skills/paper-pipeline/scripts/consumer.mjs`; the links are made by
`src/link-skills.ts`; install-specific paths are flagged by `eslint-rules/install-path-literals.ts`.

## Rules

### Skills Ship In Skills

**Guidance only** — Skills ship in `skills/`, never `.claude/skills/`. `paperlint init` symlinks each one into the consumer's `.claude/skills/<name>`; the link's directory name is the skill's name. `skills/` is the npm layout: of 855 packages scanned, 336 shipped `skills/` against 15 `.claude/skills/`. Rejected: leaving the skills for Claude Code to find inside `node_modules` (`docs/install.md`); a symlink loads at startup, deterministically. A skill for working on paperlint itself (it edits this repository's presets, tests or source) does not ship: it lives in `.claude/skills/<name>/` as a real directory, outside `files`, and no shipped skill or user doc names it (`add-venue`).

### One Owner Per Job

**Guidance only** — Each job on a paper's text has one owner skill, and the others hand over to it instead of carrying their own instructions for it: find unclear sentences — `cold-read-diff` (the last edit), `grade-paper-writing` (the whole paper); grade the prose — `grade-paper-writing`; rewrite for clarity — `rewrite-unclear`; cut for length — `tighten-paper`; the order of the argument — `argument-arc`; is it ready to submit — `harden-paper`; which stage runs next — `paper-pipeline`. A skill that finds a problem it does not own names the owner and stops. A second copy of an owner's rule in another skill is a defect: two copies drift, and the reader follows whichever it read last.

### A Criterion That Judges Prose

**Guidance only** — It follows the five principles in `eslint-rules/CLAUDE.md` ("A rule that judges prose"). A skill does not grep prose for what a rule can count.
