<!-- vigiles:sha256:ff68e0de1e35b2f3 compiled from skills/CLAUDE.md.spec.ts -->

# CLAUDE.md

## `skills/`

The skills this package ships. Loaded when working under `skills/`. The consumer's root and the
package's location come from `skills/paper-pipeline/scripts/consumer.mjs`; the links are made by
`src/link-skills.ts`; install-specific paths are flagged by `eslint-rules/install-path-literals.ts`.

## Rules

### Skills Ship In Skills

**Guidance only** — Skills ship in `skills/`, never `.claude/skills/`. `paperlint init` symlinks each one into the consumer's `.claude/skills/<name>`; the link's directory name is the skill's name. `skills/` is the npm layout: of 855 packages scanned, 336 shipped `skills/` against 15 `.claude/skills/`. Rejected: leaving the skills for Claude Code to find inside `node_modules` (`docs/install.md`); a symlink loads at startup, deterministically. A skill for working on paperlint itself (it edits this repository's presets, tests or source) does not ship: it lives in `.claude/skills/<name>/` as a real directory, outside `files`, and no shipped skill or user doc names it (`add-venue`).

### Required Or See Also

**Guidance only** — A link from one skill to another is either required or see-also. A required skill is a step of the skill that names it: the marker `` **Required sub-skill:** `<name>` `` sits where the step happens, the skill is invoked BY NAME with the Skill tool, and the skill carrying the marker declares `Skill`. Selection from a description is unstable (`pc-panel-review`, step 2: 21% and 50–54% on identical inputs), and seven description rewrites landed inside that noise, so a required step never rests on selection. Any other mention is see-also. `checkSkill` in `lib/skill-checks.mjs` refuses a required name with no skill installed beside it, and a required link without `Skill`.

### A Criterion That Judges Prose

**Guidance only** — It follows the five principles in `eslint-rules/CLAUDE.md` ("A rule that judges prose"). A skill does not grep prose for what a rule can count.
