<!-- vigiles:sha256:6312a3b8f9804eba compiled from plugin/CLAUDE.md.spec.ts -->

# CLAUDE.md

## `plugin/`

Not a plugin any more. `plugin/hooks/hooks.json` is the hook wiring that `paperlint init` merges
into the consumer's `.claude/settings.json`, and it is the only source of that wiring.

## Why there is no Claude Code plugin

There is no Claude Code plugin or marketplace entry; it was removed in the release after 1.0.0
(#82). Do not bring it back without answering each of these, measured (`docs/install.md`,
"Why it is shaped this way"):

- **A plugin cannot carry the code.** Claude Code installs a plugin's dependencies with a 60-second
  timeout, and a failed install never blocks the plugin: the hooks load and fail with
  `cannot find module vigiles`, silently.
- **The skills need the npm package anyway.** 23 of 24 skills ran scripts that resolve only through
  `node_modules/paperlint/`.
- **Its manifests carried versions nothing updated**, and Claude Code decides plugin updates from
  that number.
