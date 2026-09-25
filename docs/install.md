# How installation is supposed to work, and why

This is a decision record, not a how-to. The how-to is the README. This file exists because the
install was rebuilt three times — a copy-paste line, then a `--with-hooks` flag, then a
self-contained bundle — and each attempt was designed from the armchair. This time the shape was
taken from tools that already solved it, and each claim below was measured.

## The one number that matters

**How many actions does a person perform between "I want this" and "it works"?** Every copied
command, every flag, every "now add this to your config by hand" is one action and one chance to
stop.

🔴 **SHIPPED 2026-09-18 — the table below is now HISTORY, and it is kept because the count is
the argument.** `rpp init` performs steps 3, 4, 5 and 8 itself and reports step 9; what is left
is the three-row table at the bottom of this file. The nine rows stay written down because a
target count means nothing without the count it replaced.

Counted for this package **before** that change:

| #   | action                                                    | why it exists                            |
| --- | --------------------------------------------------------- | ---------------------------------------- |
| 1   | look up a commit sha                                      | not on npm yet                           |
| 2   | `npm i -D github:zernie/research-paper-pipeline#<sha>`    |                                          |
| 3   | `npx rpp init`                                            | writes `rpp.json`                        |
| 4   | edit `rpp.json` so `papers` points at your papers         | the default is a guess                   |
| 5   | **edit `package.json` to declare `papers` a second time** | the hooks read that file, not `rpp.json` |
| 6   | `/plugin marketplace add …` inside Claude Code            |                                          |
| 7   | `/plugin install …` inside Claude Code                    |                                          |
| 8   | hand-add the CI step, with a sha                          |                                          |
| 9   | install TeX Live, poppler, a JRE, python3                 | the skills shell out to them             |

(Row 9 is the state on 2026-09-18. Since 2026-09-24 TeX Live is `npx rpp toolchain`, or a
`[Y/n]` inside `rpp build`, and poppler is gone — rpp reads PDFs with pdf.js, shipped as a
dependency. Since 2026-09-25 `rpp toolchain` also fetches banal, which runs on pdf.js output and
needs perl. A JRE and python3 are still the user's.)

Nine, three of which are hand-edits to files, and one of which — step 5 — is undocumented enough
that skipping it leaves `paper-edit-guard` **silently watching a directory that does not exist**
(measured; issue #33).

## What comparable tools do

Measured 2026-09-18 by reading published tarballs, not docs, with `esbuild` as a known-positive
control for the probe.

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

Three findings carry over here.

**Nobody installs anything at postinstall time, and the two who used to say why they stopped.**
npm's own rule, quoted in husky's write-up: _"The only valid use of install or preinstall scripts
is for compilation."_ Yarn 2: _"postinstall scripts are not a viable solution."_ husky adds two
concrete failure modes — the package manager's cache makes a failed install unrepeatable (_"if
Husky 4 failed to install the first time, re-running `npm install` won't work due to the cache"_),
and package managers suppress the output, which matters _"for a tool with a big side effect
(changing Git hooks)"_. Playwright's v1.38.0 notes: _"we recommend to explicitly download browsers
via `npx playwright install` command."_

This settles a question this package asked twice: an automatic install that can quietly fail is
worse than an explicit step that says what it needs.

**The winning shape is an `init` that writes the config for you.** Six of the eight write it;
the two that do not (Prettier, lint-staged) have the worst counts on the list.

**Ask only about what cannot be guessed or is expensive.** Playwright is the closest analogue to
this package — config plus a CI workflow plus a heavy external toolchain — and it asks exactly two
questions: do you want the workflow, and may I download 300 MB of browsers. Everything guessable it
guesses. ESLint asks more because language and framework genuinely cannot be inferred.

## Decisions

### One declaration, and it lives in `package.json`

`rpp.json` is folded into the `research-paper-pipeline` key of `package.json`, and read from
`rpp.json` only as a deprecated fallback that `rpp lint` reports.

This reverses the decision that introduced `rpp.json` days earlier, and the reason is a count, not
a preference: the `package.json` key has **five** readers — three hooks, `eslint-rules/papers.mjs`,
`lib/skill-trigger-cases.mjs`, `skills/paper-pipeline/scripts/consumer.mjs` — and `rpp.json` has
**one**, the CLI. Folding moves one reader; the other direction moves five.

The deeper reason is the one Tailwind acted on when it deleted its `init`: do not scaffold a new
file for a fact that can live in a file the project already has. A hook cannot import code and
cannot discover a config by walking up a tree — it can only `cat` a path it is able to name. The
one path it can always name is `$CLAUDE_PROJECT_DIR/package.json`.

### The guard and the linter must be proved to agree

The split config is how the defect got in; the defect itself is that **nothing ever compared what
the CLI lints with what the hook guards**. Merging the files removes today's instance and does not
remove the class — a future second surface would reintroduce it. So the comparison becomes a check
that runs, not a property that happens to hold.

### Nothing is installed at install time

No postinstall, no autoinstall of TeX. The external toolchain is **reported**, never fetched: the
report names each missing program, which skills go quiet without it, and the command that installs
it. This follows the evidence above and this repo's own rule that an installer must verify the
result rather than trust its exit code.

### `rpp doctor` — the command that makes silence visible

Prior art is outside the JS ecosystem: `brew doctor`, `flutter doctor`, `npm doctor`,
`expo-doctor`. None of the eight tools above ships one, and none of them needs one, because none of
them has a guard whose success state is silence.

This package does. `paper-edit-guard` reports nothing when it is working and reports nothing when
it is watching an empty directory, so "installed" and "protecting you" are indistinguishable from
outside. `doctor` is what tells them apart: it prints the papers directory the CLI resolved, the
one the hook will resolve, whether they are the same, whether the hooks are wired in
`.claude/settings.json` (once, twice, or not at all — and whether the project also enables the
old plugin), and which external programs are missing. A plugin installed at user scope is outside
what it can read, and it says so.

## The target count

| #   | action                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `npm i -D research-paper-pipeline`                                                                                                                                                                                  |
| 2   | `npx rpp init` — detects the papers directory, writes the declaration, links the skills into `.claude/skills/`, writes the hooks into `.claude/settings.json`, offers the CI workflow, reports any missing programs |

Two, both in the same terminal.

🔴 **CORRECTED 2026-09-23 — this section used to say three, and that "step 3 cannot be collapsed:
it is typed into a different program, and nothing on disk can type it for you."** Step 3 was the two
`/plugin` lines typed inside Claude Code. The premise was that hooks reach Claude Code only through
a plugin. They also reach it through a file on disk: `.claude/settings.json`, which Claude Code
documents as the way to share hooks with a team and which `init` can write. The plugin route also
could not be run by an agent, could not be checked by `rpp doctor`, and — as a plugin the
repository declares — is not installed in a cloud session. The decision and its sources:
[`prior-art/paper-folder-scaffolding.md`](prior-art/paper-folder-scaffolding.md) § 5.

### What the implementation added to this plan, and why

One thing here was designed from the armchair after all, and the build found it: **the CLI itself
could not read the single declaration.** `rpp lint` looked only for `rpp.json`, so an `init` that
writes the `package.json` key and nothing else produces an install where the very next command
reports "nothing to lint". Folding the declaration is not complete until the folding reader
exists — `findDeclaration` in `src/cli.ts` now walks for either carrier, prefers `package.json`
at each level, and says out loud when it fell back to the deprecated one.

And one measurement, taken on a real pseudo-terminal rather than reasoned about: Node's
`readline` `question()` REJECTS with `AbortError: Aborted with Ctrl+D` when the answer stream
ends. That rejection escaped `init` as a stack trace **after** the declaration had already been
written, so the install both succeeded and looked like a crash. An unanswered question is an
answer; it now takes the default. Prompting itself turned out to be perfectly testable — the
question function is injected, so the assertions never need a terminal, and the one property
that does need a terminal (that a real prompt appears and its answer is used) was checked once
by hand under `script`.

## Which package managers are covered, and why Yarn PnP is not

Moved out of the README on 2026-09-19: a reader deciding whether to try the tool needs the
verdict, not the forensics. The verdict is that npm and pnpm are covered and Yarn Plug'n'Play is
not supported.

`test/e2e/install.mjs` packs the tarball, installs it into a clean consumer project with each
manager that is actually present on the machine (`npm --version`, `pnpm --version` — a manager
that does not launch is not counted), and then **runs the hook command** to see whether it
resolves. The check is deliberately not a grep over `hooks.json`: the string there is correct
under any manager, while whether it resolves is a property of the tree the manager laid out on
disk. The verdict is whether the command died on `Cannot find module`.

This matters because one decision has already diverged between the repository's own tree and a
consumer's: moving `vigiles` from peer to regular dependencies works on npm and does not work on
pnpm, because the hook wiring addresses the runtime from the project root and pnpm does not put
transitive dependencies at the root. No test found that.

**Yarn Plug'n'Play is excluded by construction, not by omission.** The hook commands in
`plugin/hooks/hooks.json` name
`${CLAUDE_PROJECT_DIR}/node_modules/research-paper-pipeline/bin/rpp.mjs` literally, and under PnP
there is no `node_modules` directory for that path to resolve against. Supporting it would mean a
different way of answering "where is the runtime", not a flag.

## Why the plugin ships no code

⚠️ **Since 2026-09-23 the plugin is no longer how anything is installed.** `rpp init` installs both
halves itself: it writes the hook commands into `.claude/settings.json` (see "The target count"
above), and it links every skill into `.claude/skills/<name>` as a symlink (see "The npm package is
not where Claude Code looks" below). `plugin/hooks/hooks.json` stays, as the one source `init`
reads the hook wiring from, and the marketplace entry stays for one
release so existing plugin users are not broken; `init` and `doctor` tell a project that enables
the plugin to uninstall it, because plugin + settings would run every hook twice. The reasoning
below is still why the plugin never carried code.

The plugin carries the hook wiring only — a manifest and `plugin/hooks/hooks.json`. That split is
deliberate, and it is also forced.

A plugin fetched from npm gets **no** `node_modules` at all, and gets them silently: `npm pack`
strips `package-lock.json` unconditionally, and the host runs `npm ci` only when a lockfile is
present in the fetched copy. Measured 2026-09-19; the probes are in
[`prior-art/repro/`](prior-art/repro/README.md). A plugin that carried the skills would therefore
carry scripts it could not run — the failure arriving as `Cannot find module` at hook time, on a
plugin that installed cleanly.

So the skills ride with the npm package, where a real install has happened, and the plugin stays
empty enough that it cannot have this problem.

### The npm package is not where Claude Code looks — `rpp init` links the skills

Riding with the npm package gets the skills onto disk, not into Claude Code. Claude Code discovers
project skills in `.claude/skills/<name>/SKILL.md` (plus user and plugin skills) and never inside
`node_modules`. Until 2026-09-23 the README said the skills "sit in
`node_modules/research-paper-pipeline/skills/` and Claude Code reads them from there"; that was
false, and a consumer who followed it had no `/paper-pipeline` (Codex review on #45). Every test
stayed green meanwhile, because every test looked at the package directory, not at the project.

The one consumer where the skills did work had made the links by hand, one per skill:

```
.claude/skills/<name> -> ../../node_modules/research-paper-pipeline/skills/<name>
```

`rpp init` now makes exactly those links (`src/link-skills.ts`). They are also what makes the
project-root-relative script paths inside the skills (`.claude/skills/paper-pipeline/scripts/x.mjs`,
89 of 104 script references on 2026-09-23; the install e2e prints the live count) resolve in a
consumer at all.

- **What is linked** is read from the package's own declaration — `.claude-plugin/plugin.json`,
  `"skills"` — every subdirectory holding a `SKILL.md`. No list and no count is written down.
- **Where the link points** is the package as it resolves by name from the project, spelled
  through the project's own `node_modules/research-paper-pipeline`. Under pnpm the resolved path
  is the version-stamped `.pnpm/…` store directory; a link spelled that way would dangle after the
  next upgrade, one through `node_modules/research-paper-pipeline` does not.
- **What it never does** is replace an entry it did not make. A directory, a file, a link
  elsewhere or a dangling link under a shipped skill's name is reported by name and left alone,
  and that does not fail `init`: refusing to overwrite is the correct outcome, not a broken install.
  `rpp doctor` repeats the gap as a warning, with the same reasoning as a missing external program.

`test/e2e/install.mjs` checks it from the consumer's side under npm and pnpm: every shipped skill
reachable as `<consumer>/.claude/skills/<name>/SKILL.md`, every script path resolving from the
consumer root, a second `init` changing nothing, and a foreign directory under a shipped name
surviving untouched.

## What `rpp init` writes

Moved out of the README on 2026-09-23. Exactly:

| what                                                               | where                   | when                                                                                                                                                                              |
| ------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a `research-paper-pipeline` key naming your papers directory       | your `package.json`     | always                                                                                                                                                                            |
| the three hook commands, merged in beside your own entries         | `.claude/settings.json` | by default. A human at a terminal is asked [Y/n]; an agent, CI or `--yes` gets YES; `--no-hooks` skips. Hand-wired under another spelling: nothing written, so nothing runs twice |
| a GitHub Actions workflow                                          | `.github/workflows/`    | only if you say yes; it asks once, and only when a human is at a terminal (stdin and stdout, no `CI`, no `--yes`)                                                                 |
| a first paper, via `rpp new`                                       | `<papers>/<name>/`      | only when the papers directory holds none: asked of a human at a terminal, otherwise only with `--paper <name>`                                                                   |
| one relative symlink per shipped skill, into the installed package | `.claude/skills/<name>` | always — except where that name is already taken (a directory, a file, a link elsewhere): that entry is left as it is and named in the report                                     |

It installs no software and touches nothing else. It ends by running `rpp doctor` and exits with
its verdict.

## Install size

Measured 2026-09-23 on a clean project with npm 10.9.7 (`npm i <tarball>`, production
dependencies only), **before** zernie/vigiles#280 made the `vigiles` grammars optional — so the
`@ast-grep/*` and `typescript` rows below are expected to shrink; re-measure before quoting them.

|                                        |       size |
| -------------------------------------- | ---------: |
| tarball                                |     1.2 MB |
| this package, unpacked                 |     3.7 MB |
| **`node_modules` in total**            | **136 MB** |
| of which `@ast-grep/*` (via `vigiles`) |      51 MB |
| of which `typescript` (via `vigiles`)  |      23 MB |
| of which `vigiles` itself              |       6 MB |

Neither `rpp lint` nor any of the three hooks loads `@ast-grep` or `typescript` — measured by
tracing every module they resolve; `vigiles` itself is loaded.
