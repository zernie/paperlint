# End-to-end tests

They are vitest tests named `*.e2e.ts` under `test/e2e/`, one vitest project per environment they
need, found by the project's glob — no list of files exists in `package.json`, `scripts/check.ts`
or CI:

| script                     | project       | what it needs                                | files                       |
| -------------------------- | ------------- | -------------------------------------------- | --------------------------- |
| `npm run test:e2e:install` | `e2e-install` | npm and pnpm, and the network for `npm pack` | `test/e2e/install/*.e2e.ts` |
| `npm run test:e2e:tex`     | `e2e-tex`     | TeX Live from `paperlint toolchain`, banal   | `test/e2e/tex/*.e2e.ts`     |
| `npm run test:e2e`         | both          |                                              |                             |

Both areas are part of `npm run check`, so nobody has to remember to call them. CI runs each in the
job that has its environment: `test:e2e:install` in `gates`, `test:e2e:tex` in `build-e2e`.

This page says what they prove, what they deliberately do not, and when a change owes a new one.

## The line between the other tests and an end-to-end run

The rest of the package is tested by unit and integration tests and, for what an agent sees, by
harnesses — [`testing.md`](testing.md) says which is which. A rule is tested twice before any e2e:
unit tests beside it hand its logic a defect and a clean input, and `src/rule-cases.test.ts` runs
every registered rule through real ESLint on a small paper tree, the way `paperlint lint` does.
That is still an integration test: no TeX, no install, the working tree as it is.

Those tests run **in this repository's process, against this repository's working tree**. They
import the modules directly. Every path resolves, every dependency is already installed, and the
file they read is the file in `git`. An end-to-end run exists because all three of those are
assumptions that stop holding the moment somebody else installs the package.

| question                                                                             | answered by                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| does this rule find this defect, and stay quiet otherwise                            | unit, beside the rule                                         |
| does the rule run through ESLint, wired, on the file it is for                       | integration (`src/rule-cases.test.ts`)                        |
| does the CLI pick the right script, with the right interpreter                       | integration (`src/build.harness.mjs` substitutes `spawnSync`) |
| does the tarball, installed into a tree that is not this one, contain what it claims | **e2e**                                                       |
| do the paths written inside a skill resolve where the package actually lands         | **e2e**                                                       |
| did a PDF come out, and is it typeset in the fonts the venue requires                | **e2e**                                                       |

The last three rows are the ones no other test can reach even in principle: the defect only exists
once the code is somewhere else, or once a real TeX has typeset it.

## `test/e2e/install/install.e2e.ts` — the package, installed

It runs `npm pack`, then installs the resulting tarball into a fresh temporary tree, **under npm
and under pnpm separately** — one test per manager, each the whole scenario, because its steps
depend on each other — and drives the installed binary:

- the install itself finishes
- `paperlint --help` answers with zero
- `paperlint init` takes the default papers directory and writes no `paperlint.json` for it
- `paperlint init` finishes with zero — its doctor found no discrepancy
- `paperlint init` wires the hooks into `.claude/settings.json` — the same commands `hooks.json`
  publishes, once each — and says they need `npm install` in a fresh clone; a second `init`
  leaves that file byte-identical
- `paperlint lint` passes the staged corpus
- `paperlint new demo` scaffolds a paper from the templates that shipped in the tarball, its own lint is
  clean, and `paperlint lint` stays clean with it in the corpus
- `hooks.json` arrived and parses, and every hook command named in it resolves to a file
- every skill arrived, and every script path named inside a skill resolves **in the consumer**

The last two rows are the reason this file exists. A skill is a markdown document with paths in
it; nothing in this repository's own test run would notice that those paths only work here.

🔴 **Two package managers, not one, and it is not belt-and-braces.** The wiring addresses the
runtime from the project root, and pnpm does not put transitive dependencies at the root. A layout
that works under npm can be dead under pnpm with no error anywhere. The same run also launches the
binary **directly** rather than through `node <path>`: under npm `.bin` holds a symlink, under
pnpm a shell wrapper, and calling `node bin` measures the caller's habit instead of the package.

## `test/e2e/tex/build.e2e.ts` — a real `pdflatex`

It copies `fixtures/build-e2e/` — nine papers, none with a build script paperlint would run — into
a temporary tree, points a config at it, and runs `paperlint build --all`. paperlint compiles each
paper itself with the real `pdflatex` and `bibtex`; the artifacts are then measured with
paperlint's own pdf.js reader from `dist/`, and the fonts are cross-checked against the list of
programs pdfTeX writes into `paper.log`.

**Each fixture declares what it must produce** in `fixtures/build-e2e/<name>/expect.json`, parsed
with the schema in `test/e2e/tex/build-expect.ts`: whether it builds (`build.outcome`), what its
lines of the build output say, its fonts, its last page's text, files in its directory, the facts
the build measured, and — for `paperlint lint` after the build — the exit code and **exactly** the
findings for each rule it names (`[]` is "none"). One `describe` per fixture directory turns each
declared field into a test. A folder without `expect.json`, or with one the schema rejects, fails.
A new venue fixture is a new folder: its paper, its `paperlint.json`, its `expect.json`.

| fixture              | what it is there to prove                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `acmart`             | a real `\documentclass{acmart}` source builds, and the PDF carries the class's **own** font families — not one family of the silent substitution                                                                                                                                                                                                                                                                                                                                                       |
| `fallback`           | the same document with the fonts missing still **builds green**, and is **rejected** by the font check. The failure is in the artifact, not in the exit code                                                                                                                                                                                                                                                                                                                                           |
| `cite`               | the bibtex path: the PDF shows `[1]`, not `[?]`, and no `??`. Its `build.sh` would leave a trace if run — it must not run, and the run must say it is ignored                                                                                                                                                                                                                                                                                                                                          |
| `guards`             | `\input{paper-guards}` resolves with no configuration, because paperlint puts its own venues directory on `TEXINPUTS`                                                                                                                                                                                                                                                                                                                                                                                  |
| `unbalanced`         | a two-column acmart paper whose last page comes out 621.5 / 264.8 pt builds **green** — the build does not judge the layout and rewrites nothing — while `_build/paper.facts.json` records both heights, and `paperlint lint` with `pdf/last-page-balance` turned on in `rules` reports the page                                                                                                                                                                                                       |
| `broken`             | a failing build names pdflatex and its exit code, quotes the error line and its `l.NNN` context, and deletes the stale `paper.pdf` planted before the run                                                                                                                                                                                                                                                                                                                                              |
| `no-source`          | a paper with no `paper.tex` is named separately, and the run as a whole is a failure                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `empty`              | a document with no pages: pdflatex exits 0 and writes no PDF, and that is a failure, not a green `paper.pdf`                                                                                                                                                                                                                                                                                                                                                                                           |
| `aidc`               | a real `[conference,compsoc]{IEEEtran}` paper builds on paperlint's TeX Live in NimbusRomNo9L, `tex/template`, `tex/required-section` and the `pdf/*` rules find nothing, and `tex/venue-leftover` warns once, on its planted line. It declares `identity` and names nobody, so `anonymity/identity` is silent on a real build, and `format/page-limit` finds the IEEEtran «References» heading                                                                                                        |
| `anon-*`             | six AIDC papers, each planting the declared (invented) name on ONE path, and `anonymity/identity` reports exactly one finding naming where: `author` the author block · `ack` an acknowledgments paragraph · `bib` a self-citation, printed by `IEEEtran.bst` as «A. Example» · `pdfauthor` `\hypersetup{pdfauthor=…}`, on no page · `href` a link whose target is the author's account while its text is not (the anonymous mirror beside it is not reported) · `macro` the name behind `\newcommand` |
| `msr`                | a real `[10pt,conference]{IEEEtran}` paper whose ten pages of main text include an appendix before the references, then two pages of only references: `format/page-limit`, `tex/template` and `anonymity/identity` find nothing. banal's count of the same PDF (body 9, references 3) would have failed it                                                                                                                                                                                             |
| `msr-appendix-after` | the appendix after the references brings the main text to eleven pages: exactly one `format/page-limit` finding, naming where the appendix starts. banal's count (body 9, references 2) would have passed it                                                                                                                                                                                                                                                                                           |

The `fallback` row is the point of the whole file. `acmart.cls` checks for `libertine.sty`,
`zi4.sty` and `newtxmath.sty`, and failing to find any of them sets `\@ACM@newfontsfalse` and
typesets the paper in Computer Modern. The build is green, the PDF looks fine, the metrics differ,
and therefore so does the pagination. A submitted paper went out that way. **An exit code cannot
see it, so the content of the artifact is what gets measured.**

**Where the body ends, on real papers** (`test/e2e/tex/page-count.e2e.ts`). `format/page-limit`
counts a body that ends at the references, and that count is checked on papers nobody here wrote:
the accepted ACSAC papers in `fixtures/accepted-papers/` that carry a `page-count.json` (ACSAC is
AIDC's parent venue, same IEEEtran template), built with figures replaced by blank boxes of the
same size and the packages paperlint's TeX Live lacks vendored beside them. Each `page-count.json`
holds the references page and the body count established by rendering the PDF and looking at it,
with the evidence in words. `page-count-variants.json` derives papers from them, each changing ONE
thing: the references forced to the top of a page, a `\subsection*{References}` or a table headed
«References» in the body, the appendix moved before or after the bibliography, hyperref removed. The test
builds all of them in one `build --all` and requires the detector's count to equal the recorded
one, then lints two of them under AIDC's regular limit of 12: the 12-page body passes, the 13-page
body is reported. Eleven builds, the lint runs included, took 95 s here.

The same build carries `pdf/body-size` (`body-size.json` beside the papers): the four ACSAC papers
and the ACM `agenticdev-acm26` must draw no finding, and three variants — the body in IEEEtran's
`9pt`, the bibliography in `\scriptsize`, the bibliography in `\small` — exactly the recorded one.
The sizes the build measured are compared with the recorded ones first, so a drift in banal shows as
itself. The rule is linted once over all eight `paper.tex`, since a lint of a real paper takes
10–25 s, nearly all of it in the prose rules.

Beside the fixtures, one test proves the refusal with no TeX at all: PATH holds `node` alone, the
cache directory is empty and `CI` is set, and `paperlint build` must exit 1 with one line naming
`npx paperlint toolchain` and the venue's packages, print no plan and create no PDF and no cache.
The rest asks `paperlint build --dry-run` which TeX Live the real run will use; under CI that must
be paperlint's own cache, because the runner has no other.

## `test/e2e/tex/toolchain.e2e.ts` — real TeX Live, and only it

`paperlint toolchain` into `$PAPERLINT_TEXLIVE_DIR` against real CTAN; a second run must say "nothing to do"
within seconds; `--check` must exit 0; then the `acmart` fixture is built with PATH holding `node`
only, so no other TeX Live and no PDF tool can stand in, and the PDF must carry Libertine and Biolinum
and no Computer Modern face. Without `PAPERLINT_TEXLIVE_DIR` its tests are skipped: installing ~270 MB
into a home directory as a side effect of `npm run check` is the unasked install rule 11 forbids.
`src/toolchain.harness.mjs` covers the installer's logic (mirror fallback, archive check, time
limit, verification, idempotence) against a fake mirror on disk, without the network.

## Skips are reported, never passed

A clone without TeX Live genuinely cannot run the build e2e; a machine without pnpm cannot run
half of the install e2e. Their tests are then `skipIf`'d, and vitest reports them as skipped.
`npm run check` reads that count from vitest's JSON report and prints the gate as
`SKIPPED — not run, not passed`. In CI the same absence means a broken environment: with `CI` set
(or `PAPERLINT_E2E_STRICT=1`) each such file registers one more test that fails and names what is
missing (`test/e2e/need.ts`).

A skipped step and a passed one look identical in a CI interface. That is the class this whole
package is written against, so it is not allowed to happen inside it either.

## When a change owes an e2e

Not every change does. The trigger is countable — ask whether the change touches something that is
**only true after installation**:

- a new file or directory that has to arrive on the consumer's disk (a skill, a hook, a template)
- a path written inside a document rather than resolved by a module loader
- anything read through `package.json` fields — `bin`, `files`, `exports`
- a new external program the pipeline shells out to
- a new artifact the pipeline produces whose **content** can be wrong while the exit code is zero
- a new template-family preset: the TeX packages it declares, and the page size and fonts measured
  from a real build of its class → one fixture folder in `fixtures/build-e2e/`, with its
  `expect.json`

If none of those apply, a unit or integration test beside the changed module is the right test,
and an e2e run would only make the suite slower without making it stricter. A new rule is not a
trigger by itself: its cases in `src/rule-cases.test.ts` already run it through real ESLint.

## What these two do NOT cover

Named here on purpose: a test suite that does not say where it stops is read as covering
everything.

- **macOS and Windows.** Locally these run on whatever machine you have. In CI `build-e2e` is a
  matrix over `ubuntu-latest` and `macos-latest`; Windows is not run anywhere, and `paperlint toolchain`
  refuses it.
- **The rules, on a real document.** `fixtures/real-markdown-paper/` holds a published article and
  a recorded baseline of what the rules say about it. That is a **lint** fixture, driven by a
  harness — it does not go through the installed package. Wiring it into the install corpus is
  open work, not something already done.
- **The skills as behaviour.** The install run proves a skill arrived and that its paths resolve.
  Whether the agent then does the right thing with it is a different measurement, and it belongs
  to the harness tier of `vigiles`, not here.
- **Registry publication.** The package is on npm: `research-paper-pipeline@1.0.0` was published
  on 2026-09-25 by `.github/workflows/release.yml`; from 2.0.0 it is published as `paperlint`, the
  same way. The
  e2e still covers the packlist through `npm pack`, which produces the same tarball `npm publish`
  uploads; the registry round-trip — install from npm, then run — is still not run by any test.

## The corpus

`stageCorpus()` in `test/e2e/install/install.e2e.ts` writes a small paper by hand — a declared stage, its
PDF, its byte counts, the cross-check between them — and copies `fixtures/build-e2e/acmart` beside
it so the LaTeX rules see LaTeX rather than a placeholder.

⚠️ **Every line of that corpus was written by somebody who already knew which rule would read it.**
It keeps the stage machinery honest and it cannot tell you anything about false positives. That is
what the real-article fixture is for, and why the two tiers are not substitutes.
