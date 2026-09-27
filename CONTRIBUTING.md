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

Three rules for writing the test itself:

1. **Red first.** Run a new test on the code BEFORE the fix and watch it fail at its own
   assertion. A test that has only ever been green is indistinguishable from one that cannot fail.
2. **Assert the whole value** — `assert.deepEqual` / `toEqual` on the entire result, not a
   substring or one field. A substring passes on output that is wrong everywhere else. The
   exception is prose whose wording is not the subject; say so in a comment.
3. **Test what the code does, not what its source says.** A test that reads a source file and
   asserts it contains some text restates the file: rewording turns it red, a real regression
   stays green. Assert a return value, a run's output and exit code, or what landed on disk.

Say what an assertion guards in a comment directly above it (`// Guards: …`). A harness asserts
through the shared `lib/check.mjs` (`const check = createChecker()`), which prints the label and
the detail on failure and counts every call; a new harness does not define its own `check`.

A harness runs in this tree, against this working copy. That is the wrong shape for a defect that
only exists once somebody else has installed the package — a path written inside a skill, a file
that never made it into the tarball, a PDF whose content is wrong while the exit code is zero.
Those are covered by the end-to-end runs, and [`docs/e2e.md`](docs/e2e.md) says which question
belongs to which tier, and **when a change owes a new e2e rather than a harness**.

An example of why asserting the value matters: `js-yaml` 5 stopped parsing an unquoted date as a
`Date`, every harness stayed green under both majors, and the rule's date coercion had quietly
become dead code — no test asserted the coerced value.

## Running the checks: one command

```sh
npm run check
```

That is the whole instruction. It runs every gate in order — build, lint, every harness, the
install e2e under npm and pnpm, and a real `pdflatex` build — and ends

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
eslint-rules/   the rules, each with its .harness.mjs beside it
lib/            shared readers — markdown, skill corpus
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
npm test                 # every *.test.ts, then every harness (Node >= 22.18)
npm run coverage         # the same, under c8, failing below the thresholds in .c8rc.json
```

None of these are needed to USE the tool — they are here because the gates are part of the
argument, not decoration.

Coverage is 100% for lines, statements, functions and branches, and there is no `c8 ignore`:
code a test cannot reach directly — a race, a permission, a broken install, a real download — takes
the effect as a parameter (the ports in `src/ports`, an injected `readdir` or runner), and the test
passes a fake. `scripts/coverage-config.test.ts` fails on a coverage-ignore comment and on any
change to `.c8rc.json`'s exclude list that was not made there on purpose.

## Adding a venue

A venue is a **preset**, a JSONC file in `skills/submit-paper/references/venues/`, validated by
`venue-profile.schema.json` beside it. Adding one is three files and no code:

1. **The preset, thin.** `venues/<name>.jsonc` extends the template family it is built on
   (`"extends": "paperlint:acm-sigconf"` for an ACM venue) and adds only what the call for papers
   sets: `format.kinds` (the page limit of each kind of paper) and, when the venue's producer asks
   for something an optional rule checks, `rules`. Every number carries the quote it came from.
   A venue on a template with no family yet stands alone (`template`, `tex`, `format`) — or, better,
   add the family first: measured on a real template build (banal + pdf.js), not copied from
   documentation ([#88](https://github.com/zernie/paperlint/issues/88)).
2. **The card.** `venues/<name>.md` — prose about the venue: deadlines, tracks, the blind model,
   what the form asks.
3. **A test.** A case in `src/presets.test.ts` that `paperlint:<name>` resolves over its family with
   the kinds you declared; `src/tex-requirements.harness.mjs` already checks every shipped preset
   against the schema.

`paperlint toolchain` picks the new preset's packages up by itself, and the README and
[`docs/rules.md`](docs/rules.md#checks-against-the-venue) list the shipped presets — update both.

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
- **harness** — the test beside a rule.

## Also in the box

**The skills** are markdown, one directory each, and they name the scripts
they run. Point your agent at `skills/` and ask it for a stage by name. The stages that need taste
stay taste and say so — `paper-adversarial-review` does not pretend to be a checker.

**The 3 hooks** run on [vigiles](https://github.com/zernie/vigiles), a runner that executes checks
inside an agent's edit loop. It is an ordinary dependency of this package, so it installs with it —
and it is most of what the install weighs.
