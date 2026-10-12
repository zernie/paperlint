# CLAUDE.md — `skills/`

The skills this package ships. Loaded when working under `skills/`.

- **Skills ship in `skills/`, never `.claude/skills/`.** `paperlint init` symlinks each one into the
  consumer's `.claude/skills/<name>` (`src/link-skills.ts`); the link's directory name is the skill's
  name. `skills/` is the npm layout: of 855 packages scanned, 336 shipped `skills/` against 15
  `.claude/skills/`. Rejected: leaving the skills for Claude Code to find inside `node_modules`
  ([`docs/install.md`](../docs/install.md)); a symlink loads at startup, deterministically.
- **A skill never names a file by where paperlint is installed.** The consumer's root and the
  package's location come from `skills/paper-pipeline/scripts/consumer.mjs`, which adapts per
  channel: own checkout · `node_modules` · plugin cache · CI. An install-specific path literal is
  flagged by `port/md-install-path` in markdown and `port/js-install-path` in scripts (`warn`).
- **A criterion that judges prose** follows the five principles in
  [`eslint-rules/CLAUDE.md`](../eslint-rules/CLAUDE.md#a-rule-that-judges-prose). A skill does not
  grep prose for what a rule can count.
