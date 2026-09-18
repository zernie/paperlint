# How installation is supposed to work, and why

This is a decision record, not a how-to. The how-to is the README. This file exists because the
install was rebuilt three times — a copy-paste line, then a `--with-hooks` flag, then a
self-contained bundle — and each attempt was designed from the armchair. This time the shape was
taken from tools that already solved it, and each claim below was measured.

## The one number that matters

**How many actions does a person perform between "I want this" and "it works"?** Every copied
command, every flag, every "now add this to your config by hand" is one action and one chance to
stop.

Counted for this package as it stands:

| # | action | why it exists |
| --- | --- | --- |
| 1 | look up a commit sha | not on npm yet |
| 2 | `npm i -D github:zernie/research-paper-pipeline#<sha>` | |
| 3 | `npx rpp init` | writes `rpp.json` |
| 4 | edit `rpp.json` so `papers` points at your papers | the default is a guess |
| 5 | **edit `package.json` to declare `papers` a second time** | the hooks read that file, not `rpp.json` |
| 6 | `/plugin marketplace add …` inside Claude Code | |
| 7 | `/plugin install …` inside Claude Code | |
| 8 | hand-add the CI step, with a sha | |
| 9 | install TeX Live, poppler, a JRE, python3 | the skills shell out to them |

Nine, three of which are hand-edits to files, and one of which — step 5 — is undocumented enough
that skipping it leaves `paper-edit-guard` **silently watching a directory that does not exist**
(measured; issue #33).

## What comparable tools do

Measured 2026-09-18 by reading published tarballs, not docs, with `esbuild` as a known-positive
control for the probe.

| tool | commands to working state | writes config? | wires hooks/CI? | install-time script? |
| --- | --- | --- | --- | --- |
| ESLint | **1** — `npm init @eslint/config@latest`, installs deps too | yes, `eslint.config.js` | no | none |
| Playwright | **1** — `npm init playwright@latest` | yes | **yes — GH Actions workflow + browsers, both asked inside init** | **removed in 1.38.0** |
| Biome | 2 — install, `biome init` | yes, zero prompts | no | none (platform binaries via optionalDependencies) |
| husky | 2 — install, `husky init` | yes — edits `package.json`, writes `.husky/`, sets `core.hooksPath` | yes, git hooks | **removed in 5.0.0** |
| changesets | 2 — install, `changeset init` | yes | no | none |
| Tailwind v4 | 3 + hand edits | **no — `init` deleted, the package has no `bin` at all** | no | none |
| Prettier | 3 — config created by shelling out to `node --eval` | **no init command exists** | no | none |
| lint-staged | 4+, all manual | no | no, delegates to husky | none |

Three findings carry over here.

**Nobody installs anything at postinstall time, and the two who used to say why they stopped.**
npm's own rule, quoted in husky's write-up: *"The only valid use of install or preinstall scripts
is for compilation."* Yarn 2: *"postinstall scripts are not a viable solution."* husky adds two
concrete failure modes — the package manager's cache makes a failed install unrepeatable (*"if
Husky 4 failed to install the first time, re-running `npm install` won't work due to the cache"*),
and package managers suppress the output, which matters *"for a tool with a big side effect
(changing Git hooks)"*. Playwright's v1.38.0 notes: *"we recommend to explicitly download browsers
via `npx playwright install` command."*

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
one the hook will resolve, whether they are the same, whether the plugin is installed, and which
external programs are missing.

## The target count

| # | action |
| --- | --- |
| 1 | `npm i -D github:zernie/research-paper-pipeline#<sha>` |
| 2 | `npx rpp init` — detects the papers directory, writes the declaration, offers the CI workflow, prints the two plugin lines and any missing programs |
| 3 | the two `/plugin` lines inside Claude Code |

Three, one of which is a paste of two lines that `init` just printed. Step 3 cannot be collapsed:
it is typed into a different program, and nothing on disk can type it for you.
