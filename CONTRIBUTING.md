# Contributing

Everything a user needs is in [`README.md`](README.md). This file is for people changing the
package.

🔴 **These sections used to live in the README.** They were moved here on 2026-09-17, because a
directory listing and a testing methodology are not what someone reads to decide whether to try
the tool. Nothing was dropped — if you are looking for a fact that used to be on the front page,
it is below.

## How this is tested

Unit and integration tests run under vitest beside the module they test; harnesses run under
vigiles and cover what an agent sees; end-to-end runs install the package and build real PDFs.
Every test is seen red first, asserts the whole value, and tests what the code does rather than
what a file says. [`docs/testing.md`](docs/testing.md) says which kind to write and how.

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
that broke the suite: the gates were run afterwards and were green, but `npm test` and the
install e2e were not among them, because there were eleven separate scripts and the only way
to run them all was from memory. A subset flag re-creates exactly that — the cheap half gets run
and reported as "the gates". If a step genuinely cannot run here, it says so out loud rather than
being skipped quietly: an e2e test that finds no TeX or no pnpm is reported SKIPPED by vitest,
and `npm run check` reads that count from vitest's JSON report and lists the gate as skipped
instead of counting it as passed. The e2e areas also run alone: `npm run test:e2e:install`,
`npm run test:e2e:tex`, or both with `npm run test:e2e`.

Each gate's command is listed in `scripts/check.ts`; run one of them directly while iterating on
one rule. They are not what you run before pushing.

**The list of gates cannot quietly fall behind CI.** `scripts/check.harness.ts` pulls the job
names out of `.github/workflows/ci.yml` and requires each to be either reproduced by a gate or
named with a reason for why it cannot be. Add a job and it goes red the same day, naming the job
nobody covered — verified by adding a `windows` job and watching it fail.

## Layout

```
eslint-rules/   the rules (TypeScript, built to dist/eslint-rules/), each with its harness beside it
lib/            shared readers — markdown, config keys (TypeScript, built to dist/lib/); skill corpus
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
                  testing.md  which kind of test to write, and the rules for all of them
```

Most of the package's rules run on users' papers and are described for users in
[`docs/rules.md`](docs/rules.md); the rest lint this package's own source and never see a user's
files.

A new rule ships with its page, `docs/rules/<group>/<rule>.md`, in these sections: What it
catches · Why · Examples (failing / passing) · Options / preset fields · What it does not check ·
How to fix. Its `meta.docs.url` points at that page, and its row in `docs/rules.md` is one line
linking there. `src/rule-docs.test.ts` holds every rule the config registers to this; the rules
older than the convention wait in its `AWAITING_PAGE` list, which only shrinks — #131 writes their
pages.

## Maintainer docs

The README links only what a user needs. These are for people changing the package:

- [`docs/prior-art/`](docs/prior-art/README.md) — how comparable tools are shaped, with the URLs
  that were checked
- [`docs/install.md`](docs/install.md) — installation: what `npm i` and `paperlint init` set up, what
  `init` writes, supported package managers, troubleshooting, and why it is shaped this way
- [`docs/e2e.md`](docs/e2e.md) — the end-to-end runs: what each proves, what they do not cover,
  and when a change owes one
- [`docs/testing.md`](docs/testing.md) — the kinds of test, which one a change needs, and the rules
  for every one
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

New code is TypeScript (#78). The last block of [`eslint.config.mjs`](eslint.config.mjs) makes any
`.js`, `.mjs` or `.cjs` file an error in the directories already converted (`TYPESCRIPT_ONLY`), so
`npm run lint` fails on one; a directory that still mixes the two is not listed yet, and the change
that converts it adds it. Code that only this repository runs (tests, `scripts/`, `test/e2e/`) is
run by `node` directly; code a consumer runs from `node_modules` needs a build first, because Node
does not strip types there.

`npm run build` is one `tsc` over two projects into one `dist/`: `tsconfig.json` builds `src/` to
`dist/*.js`, and `tsconfig.pkg.json` builds `lib/` and `eslint-rules/` to `dist/lib/` and
`dist/eslint-rules/`. Everything else imports those two through the package's subpath imports,
`#lib/<name>` and `#eslint-rules/<name>` (`"imports"` in `package.json`): the default target is the
build, which is what an install runs; the `paperlint-source` condition points at the `.ts` instead,
and `npm test` (so `npm run coverage` and `npm run check` too) and `tsconfig.test.json` set it so
they read the source. `scripts/test.ts` is the one place the tests get it; a harness run on its own
(`npx vigiles test <file>`) needs `NODE_OPTIONS=--conditions=paperlint-source`.

Consumers import the same modules by their old public names — `paperlint/eslint-rules/<name>.mjs`,
`paperlint/lib/<name>.mjs`, `paperlint/bin/paperlint.mjs` — which the `"exports"` map in
`package.json` points at `dist/`. The install e2e imports every one of them, and every
`paperlint/…` import in a `docs/` code block, from the installed package; a module moved or renamed
without its public name fails there. The five `lib/*.mjs` modules not yet converted are listed in
`"exports"` by name until step 4 (#127) converts them.

TypeScript is pinned to 6.x, not 7 (measured 2026-09-27): typescript-eslint 8.70.1 declares
`typescript: >=4.8.4 <6.1.0`, and `typescript@7.0.2`'s package root exports only its version — the
compiler API that `scripts/harness-api.test.ts` and `scripts/coverage-config.test.ts` parse with
(`createSourceFile`) moved under `typescript/unstable/*`. Moving to 7 waits for a typescript-eslint
release that allows it and for those two tests to parse through a stable API.

Coverage is 100% for lines, statements, functions and branches, and there is no `c8 ignore`:
code a test cannot reach directly — a race, a permission, a broken install, a real download — takes
the effect as a parameter (the ports in `src/ports`, an injected `readdir` or runner), and the test
passes a fake. `scripts/coverage-config.test.ts` fails on a coverage-ignore comment and on any
change to `.c8rc.json`'s exclude list that was not made there on purpose.

## Adding a venue

A venue is a **preset**, a JSONC file in `presets/`, validated by
`venue-profile.schema.json` beside it. Adding one is three files and no code:

1. **The preset, thin.** `presets/<name>.jsonc` extends the template family it is built on
   (`"extends": "paperlint:acm-sigconf"` for an ACM venue) and adds only what the call for papers
   sets: `format.kinds` (the page limit of each kind of paper) and, when the venue's producer asks
   for something an optional rule checks, `rules`. Every number carries the quote it came from.
   A venue on a template with no family yet stands alone (`template`, `tex`, `format`) — or, better,
   add the family first: measured on a real template build (banal + pdf.js), not copied from
   documentation ([#88](https://github.com/zernie/paperlint/issues/88)).
2. **The card.** `skills/submit-paper/references/venues/<name>.md` — prose about the venue: deadlines, tracks, the blind model,
   what the form asks.
3. **A test.** A case in `src/presets.test.ts` that `paperlint:<name>` resolves over its family with
   the kinds you declared; `src/tex-requirements.harness.ts` already checks every shipped preset
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
