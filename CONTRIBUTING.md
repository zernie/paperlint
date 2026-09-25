# Contributing

Everything a user needs is in [`README.md`](README.md). This file is for people changing the
package.

🔴 **These sections used to live in the README.** They were moved here on 2026-09-17, because a
directory listing and a testing methodology are not what someone reads to decide whether to try
the tool. Nothing was dropped — if you are looking for a fact that used to be on the front page,
it is below.

## How this is tested

Every rule ships with a **harness**: a test that runs the rule twice. Once on a file with a defect
planted in it, where the rule must find it. Once on a clean file, where the rule must say nothing.

The second run is the one people skip, and it is the one that matters. A rule that is broken and
finds nothing passes the first kind of test by accident — from outside, "there is nothing wrong
here" and "this check never ran" look exactly the same.

Older rules also have a **battery** (`*.mutations.mjs`): it deletes one thing the rule depends on
and then demands the harness go red, at the specific assertion that thing belongs to. **These
hand-written batteries are deprecated and being removed (#52).** Do not write a new one and do
not add cases to an existing one; instead, say what an assertion guards in a comment directly
above it (`// Guards: …`). `npm run check` fails on a new or grown battery — the frozen list in
`scripts/mutation-batteries.frozen.json` may only shrink. Whether a real mutation-testing tool
replaces them is decided in #52.

A harness runs in this tree, against this working copy. That is the wrong shape for a defect that
only exists once somebody else has installed the package — a path written inside a skill, a file
that never made it into the tarball, a PDF whose content is wrong while the exit code is zero.
Those are covered by the end-to-end runs, and [`docs/e2e.md`](docs/e2e.md) says which question
belongs to which tier, and **when a change owes a new e2e rather than a harness**.

It caught a real one on the way in: `js-yaml` 5 stopped parsing an unquoted date as a `Date`.
Every harness stayed green under both majors, and only the battery noticed that the rule's
date coercion had become dead code.

## Running the checks: one command

```sh
npm run check
```

That is the whole instruction. It runs every gate in order — build, lint, every harness, every
mutation battery, the install e2e under npm and pnpm, and a real `pdflatex` build — and ends

by printing **which CI jobs it does not reproduce, and why**.

🔴 **There is no `--fast` flag, and that is the point.** On 2026-09-19 a rule change was pushed
that broke the suite: the gates were run afterwards and were green, but `npm test` and
`test:install` were not among them, because there were eleven separate scripts and the only way
to run them all was from memory. A subset flag re-creates exactly that — the cheap half gets run
and reported as "the gates". If a step genuinely cannot run here, it says so out loud rather than
being skipped quietly: an e2e that finds no TeX or no pnpm exits 77 _having stated_ why, and
`npm run check` lists it as skipped instead of counting it as passed.

Each gate's command is listed in `scripts/check.mjs`; run one of them directly while iterating on
one rule. They are not what you run before pushing.

**The list of gates cannot quietly fall behind CI.** `scripts/check.harness.mjs` pulls the job
names out of `.github/workflows/ci.yml` and requires each to be either reproduced by a gate or
named with a reason for why it cannot be. Add a job and it goes red the same day, naming the job
nobody covered — verified by adding a `windows` job and watching it fail.

## Layout

```
eslint-rules/   the rules, each with its .harness.mjs beside it (older ones also a .mutations.mjs)
lib/            shared readers — markdown, skill corpus, the mutation driver
hooks/          three hooks for vigiles — the code
plugin/         the Claude Code plugin: wiring for those hooks, no code, no package.json
skills/         24 stage skills
scripts/        this repo's own gates
action.yml      the CI composite action
fixtures/       inputs the harnesses lint
docs/           evidence that would otherwise bloat CLAUDE.md:
                  prior-art/  how comparable tools are shaped, and why this one is shaped so
                  incidents.md  what broke, measured
                  install.md  the install contract
                  e2e.md  the end-to-end runs, and when a change owes one
```

Most of the package's rules run on users' papers and are described for users in
[`docs/rules.md`](docs/rules.md); the rest lint this package's own source and never see a user's
files.

## Maintainer docs

The README links only what a user needs. These are for people changing the package:

- [`docs/prior-art/`](docs/prior-art/README.md) — how comparable tools are shaped, with the URLs
  that were checked
- [`docs/install.md`](docs/install.md) — installation: what `npm i` and `paperlint init` set up, what
  `init` writes, supported package managers, troubleshooting, and why it is shaped this way
- [`docs/e2e.md`](docs/e2e.md) — the end-to-end runs: what each proves, what they do not cover,
  and when a change owes one
- [`docs/incidents.md`](docs/incidents.md) — what broke, measured
- [`docs/package-shape-options.md`](docs/package-shape-options.md) — the options for the
  package's shape, and the ranking

## Working on this package

```bash
npm install
npm test                 # every harness, the tests' type-check, every *.test.ts (Node >= 22.18)
node scripts/run-mutations.mjs   # run the remaining batteries (deprecated, #52 — do not add to them)
```

None of these are needed to USE the tool — they are here because the gates are part of the
argument, not decoration.

## Releases

Every push to `main` runs semantic-release (`.github/workflows/release.yml`). The squash commit —
that is, the PR title — decides what ships:

| title                                                         | release |
| ------------------------------------------------------------- | ------- |
| `feat: …`                                                     | minor   |
| `fix: …`, `perf: …`                                           | patch   |
| any type with `!` (`fix!: …`), or a `BREAKING CHANGE:` footer | major   |
| `docs:`, `chore:`, `ci:`, `test:`, `refactor:` …              | none    |

`pr-title.yml` fails a PR whose title is not a conventional commit, and for a PR with one commit
it checks that commit's subject too, because GitHub squashes to it. npm, the git tag `vX.Y.Z` and
the GitHub Release always carry the same version. Never run `npm publish` by hand.

## Why not one of the existing academic skill suites

The nearest neighbour, [`Imbad0202/academic-research-skills`](https://github.com/Imbad0202/academic-research-skills),
is a serious project with its own linters, a CI threshold gate and a write guard. "Just prompts"
is wrong about it.

The difference is **what a check is allowed to read.** Its integrity gate thresholds a numeric
score that the audited model writes about itself. Here, nothing a rule reads is authored by the
thing being checked: `paper/stages` compares a declared byte count against `statSync`, and
`paper/source` does the same for the frozen `.tex`. It also reads the paper's LaTeX source, which
that suite does not — it checks process artefacts.

Licensing differs too: that suite is CC BY-NC 4.0, this is MIT.

## Words this page uses

- **stage** — a point a paper reached and cannot un-reach: `submitted`, `camera-ready`, `arxiv`.
- **scorecard** — `PIPELINE-STATUS.md`, the file above. One per paper.
- **frozen** — a copy of the exact PDF or `.tex` that was sent, kept in `versions/`. Bytes, not a
  commit reference: squash and `gc` destroy commit references, and did.
- **harness** — the test beside a rule. **battery** — a set of edits that try to break a harness
  (deprecated, being removed in #52).

## Also in the box

**The skills** are markdown, one directory each, and they name the scripts
they run. Point your agent at `skills/` and ask it for a stage by name. The stages that need taste
stay taste and say so — `paper-adversarial-review` does not pretend to be a checker.

**The 3 hooks** run on [vigiles](https://github.com/zernie/vigiles), a runner that executes checks
inside an agent's edit loop. It is an ordinary dependency of this package, so it installs with it —
and it is most of what the install weighs.
