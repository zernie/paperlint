# Installation

This page covers what `npm i -D research-paper-pipeline` and `npx rpp init` set up, exactly what
`init` writes, which package managers work, what the install weighs, and what to do when something
is off. The README has the short version.

## Install

```sh
npm i -D research-paper-pipeline
npx rpp init
```

Two commands in one terminal. Run `npx rpp` only after the install: `rpp` on the public npm
registry is a different package.

The npm package carries everything: the `rpp` command, the ESLint rules, the Claude Code skills
and hooks, and the scripts the skills run. External programs are separate:

- **TeX Live** — `npx rpp toolchain` installs the packages your venues declare (or answer `Y` when
  `rpp build` offers). It also fetches **banal**, HotCRP's page-geometry script, which needs
  `perl`. See [`toolchain.md`](toolchain.md).
- **Java and Python 3** — some skills call them; install them yourself. `rpp init` and
  `rpp doctor` list what is missing and which skills go quiet without it. `rpp lint` needs none of
  these programs.

## What `rpp init` does

In order:

1. **Finds the papers directory**, or asks for it. The project must have a `package.json`; without
   one `init` stops and tells you to run `npm init -y` first.
2. **Declares it once**, as the `research-paper-pipeline` key in your `package.json`.
3. **Links each shipped skill** into `.claude/skills/<name>`, where Claude Code looks for skills.
4. **Writes the hook commands** into `.claude/settings.json`, beside your own entries.
5. **Offers a GitHub Actions workflow**, pinned to the release tag of the version you installed.
6. **Offers a first paper** (`rpp new`) if the papers directory has none.
7. **Reports missing external programs** and the command that installs each. It installs nothing.
8. **Runs `rpp doctor`** and exits with its verdict.

It asks only what it cannot guess or what costs something. A human at a terminal is asked; an
agent, CI or `--yes` takes the defaults, and `init` prints which default it took. An unanswered
question (Ctrl+D) also takes the default.

## What `rpp init` writes

| what                                                               | where                   | when                                                                                                                                                                              |
| ------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a `research-paper-pipeline` key naming your papers directory       | your `package.json`     | always                                                                                                                                                                            |
| the three hook commands, merged in beside your own entries         | `.claude/settings.json` | by default. A human at a terminal is asked [Y/n]; an agent, CI or `--yes` gets YES; `--no-hooks` skips. Hand-wired under another spelling: nothing written, so nothing runs twice |
| a GitHub Actions workflow, pinned to `@v<installed version>`       | `.github/workflows/`    | only if you say yes; it asks once, and only when a human is at a terminal (stdin and stdout, no `CI`, no `--yes`)                                                                 |
| a first paper, via `rpp new`                                       | `<papers>/<name>/`      | only when the papers directory holds none: asked of a human at a terminal, otherwise only with `--paper <name>`                                                                   |
| one relative symlink per shipped skill, into the installed package | `.claude/skills/<name>` | always — except where that name is already taken (a directory, a file, a link elsewhere): that entry is left as it is and named in the report                                     |

It installs no software and touches nothing else. Commit `.claude/settings.json` so every clone
gets the hooks; the hook commands run files inside `node_modules`, so a fresh clone needs
`npm install` first.

## Why it is shaped this way

**One declaration, in `package.json`.** A hook cannot import code or walk up a tree looking for a
config; it can only read a path it can spell, and the one it can always spell is
`$CLAUDE_PROJECT_DIR/package.json`. That key is read by the three hooks, `eslint-rules/papers.mjs`,
`lib/skill-trigger-cases.mjs` and `skills/paper-pipeline/scripts/consumer.mjs`; a separate
`rpp.json` was read only by the CLI. `rpp.json` is still read as a deprecated fallback, and
`rpp lint` says so.

**Nothing runs at install time.** No postinstall script and no automatic TeX download. npm's rule
is that _"the only valid use of install or preinstall scripts is for compilation"_; husky removed
its install script in 5.0.0 and Playwright in 1.38.0, because a failed install is cached and its
output is hidden. An install that can fail quietly is worse than a step that says what it needs.

**Hooks go into `.claude/settings.json`, not a plugin.** Claude Code documents that file as the
way to share hooks with a team, `init` can write it, `rpp doctor` can read it back, and it needs
nothing installed inside Claude Code. A plugin fetched from npm gets no `node_modules` (`npm pack`
strips the lockfile, and the host runs `npm ci` only when one is present), so it could not carry
code that runs (probes: [`prior-art/repro/`](prior-art/repro/README.md); decision:
[`prior-art/paper-folder-scaffolding.md`](prior-art/paper-folder-scaffolding.md) § 5). The package
ships no plugin.

**Skills are linked, not left in `node_modules`.** Claude Code finds project skills in
`.claude/skills/<name>/SKILL.md` and never inside `node_modules`. The links also make the
project-relative script paths inside the skills (`.claude/skills/paper-pipeline/scripts/x.mjs`)
resolve.

- **What is linked:** every subdirectory with a `SKILL.md` under the package's `skills/`
  directory (`SHIPPED_SKILLS_DIR` in `skills/paper-pipeline/scripts/consumer.mjs`). No list is
  written down.
- **Where a link points:** the package as it resolves by name from your project, spelled through
  `node_modules/research-paper-pipeline`. Under pnpm the resolved path is a version-stamped store
  directory, and a link spelled that way would dangle after the next upgrade.
- **What it never does:** replace an entry it did not make. Such an entry is named in the report
  and left alone, and `init` still succeeds; `rpp doctor` repeats it as a warning.

**`rpp doctor` exists because the edit guard is silent when it works.** `paper-edit-guard` says
nothing while guarding and says nothing while watching a directory that does not exist, so
"installed" and "protecting you" look the same from outside. `doctor` prints the papers directory
`rpp lint` resolves and the one the hooks resolve, whether they match, whether the hooks are wired
(once, twice, or not at all), and which external programs are missing. It also warns when the
project still enables the old `research-paper-pipeline` plugin, because plugin plus settings would
run every hook twice. A plugin installed at user scope is outside what it can read, and it says so.

### How comparable tools install

Read from their published tarballs on 2026-09-18. Most write their config from an `init`; the two
that do not (Prettier, lint-staged) need the most steps. Playwright, the closest analogue (config,
a CI workflow and a heavy toolchain), asks two questions and guesses the rest.

| tool        | commands to working state                                   | writes config?                                                      | wires hooks/CI?                                                  | install-time script?                              |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| ESLint      | **1** — `npm init @eslint/config@latest`, installs deps too | yes, `eslint.config.js`                                             | no                                                               | none                                              |
| Playwright  | **1** — `npm init playwright@latest`                        | yes                                                                 | **yes — GH Actions workflow + browsers, both asked inside init** | **removed in 1.38.0**                             |
| Biome       | 2 — install, `biome init`                                   | yes, zero prompts                                                   | no                                                               | none (platform binaries via optionalDependencies) |
| husky       | 2 — install, `husky init`                                   | yes — edits `package.json`, writes `.husky/`, sets `core.hooksPath` | yes, git hooks                                                   | **removed in 5.0.0**                              |
| changesets  | 2 — install, `changeset init`                               | yes                                                                 | no                                                               | none                                              |
| Tailwind v4 | 3 + hand edits                                              | **no — `init` deleted, the package has no `bin` at all**            | no                                                               | none                                              |
| Prettier    | 3 — config created by shelling out to `node --eval`         | **no init command exists**                                          | no                                                               | none                                              |
| lint-staged | 4+, all manual                                              | no                                                                  | no, delegates to husky                                           | none                                              |

## Package managers

**npm and pnpm are covered; Yarn Plug'n'Play is not supported.**

`test/e2e/install.mjs` packs the tarball, installs it into a clean project with each manager that
launches on the machine, and runs the hook command to see whether it resolves. A grep over
`hooks.json` would not do: the string is right under any manager, and whether it resolves depends
on the tree the manager laid out. It also checks that every shipped skill is reachable as
`.claude/skills/<name>/SKILL.md`, that a second `init` changes nothing, and that a foreign
directory under a skill's name survives.

Yarn Plug'n'Play has no `node_modules`, and the hook commands in `plugin/hooks/hooks.json` name
`${CLAUDE_PROJECT_DIR}/node_modules/research-paper-pipeline/bin/rpp.mjs`. Supporting it would need
a different answer to "where is the runtime", not a flag.

## Install size

Measured 2026-09-23 with npm 10.9.7 on a clean project (production dependencies only). Since then
zernie/vigiles#280 made the `vigiles` grammars optional, so the `@ast-grep/*` and `typescript` rows
are probably smaller now; re-measure before quoting them.

|                                        |       size |
| -------------------------------------- | ---------: |
| tarball                                |     1.2 MB |
| this package, unpacked                 |     3.7 MB |
| **`node_modules` in total**            | **136 MB** |
| of which `@ast-grep/*` (via `vigiles`) |      51 MB |
| of which `typescript` (via `vigiles`)  |      23 MB |
| of which `vigiles` itself              |       6 MB |

Neither `rpp lint` nor any of the three hooks loads `@ast-grep` or `typescript` (traced);
`vigiles` itself is loaded.

## Troubleshooting

| symptom                                               | cause and fix                                                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npx rpp` runs something unrelated                    | the package is not installed in this project, so npx fetched the other `rpp`. Run `npm i -D research-paper-pipeline` first                |
| `init` stops: no `package.json`                       | run `npm init -y`, then `npx rpp init` again                                                                                              |
| `rpp lint`: `nothing to lint`                         | no declaration was found. Run `npx rpp init`, or pass the directory: `rpp lint papers`                                                    |
| hooks fail with `Cannot find module` in a fresh clone | the hook commands run files in `node_modules`: run `npm install`                                                                          |
| `research-paper-pipeline: not built`                  | installed from git with `--ignore-scripts`, or a clone before building: run `npm run build` in the package                                |
| every hook runs twice                                 | the project still enables the old plugin. `init` and `doctor` print the uninstall command; also remove it from `enabledPlugins`           |
| a skill does not show up in Claude Code               | its name was already taken in `.claude/skills/`. `init` names it and leaves it alone; rename or remove yours and run `npx rpp init` again |
| anything else                                         | `npx rpp doctor` — it checks the setup and exits non-zero on anything miswired                                                            |
